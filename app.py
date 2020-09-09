import os
import sys
import shutil
import subprocess
import functools
import re
import time
import ctypes
import signal
import errno
from collections import defaultdict
from ctypes import create_string_buffer, byref, c_int, c_void_p, c_long, c_size_t, c_ssize_t, POINTER, get_errno
import concurrent
import asyncio

import tornado.web
from tornado import gen
from tornado.ioloop import IOLoop
from terminado import TermSocket, SingleTermManager
import logging
from loguru import logger
from elftools.elf.elffile import ELFFile
import pybcompgen

from tenacity import retry, stop_after_attempt, wait_random, retry_if_exception_type, before_sleep_log
from tenacity._utils import get_callback_name


try:
    libc=ctypes.CDLL("libc.so.6", use_errno=True)
except Exception as e1:
    try:
        libc=ctypes.CDLL("libc.so", use_errno=True)
    except Exception as e2:
        print(e1)
        print(e2)
        print("""
            libc.so.6 or libc.so not found
            If you are in Termux environment on Android,
            you may need to ensure that LD_LIBRARY_PATH contains directories where libc.so resides, eg: /system/lib64/,
            you can find that directory path by looking at the rightmost column of the command `cat /proc/$$/maps | less` in a Termux Bash shell,
            then export the LD_LIBRARY_PATH environment variable by `export LD_LIBRARY_PATH=/system/lib64/:$LD_LIBRARY_PATH`
        """)
        sys.exit(1)

# PTRACE
c_ptrace = libc.ptrace
c_pid_t = ctypes.c_int32 # This assumes pid_t is int32_t
c_ptrace.argtypes = [c_int, c_pid_t, c_void_p, c_void_p]
c_ptrace.restype = c_long
PTRACE_ATTACH = 16
PTRACE_DETACH =17

def _ptrace(pid, attach):
    op = ctypes.c_int(PTRACE_ATTACH if attach else PTRACE_DETACH)
    c_pid = c_pid_t(pid)
    null = ctypes.c_void_p()

    if not attach:
        os.kill(pid, signal.SIGSTOP)
        os.waitpid(pid, 0)

    err = c_ptrace(op, c_pid, null, null)

    if not attach:
        os.kill(pid, signal.SIGCONT)

    if err != 0:
        raise OSError("OSError %s: %s"%(
            'PTRACE_ATTACH' if attach else 'PTRACE_DETACH',
            errno.errorcode.get(ctypes.get_errno(), 'UNKNOWN')
        ))

PTRACE_STATE = {}

def ptrace_attach(pid):
    global PTRACE_STATE
    if not PTRACE_STATE.get(pid, False):
        _ptrace(pid, True)
        PTRACE_STATE[pid] = True
    else:
        logger.info("ptrace_attach locked")

def ptrace_detach(pid):
    global PTRACE_STATE
    _ptrace(pid, False)
    del PTRACE_STATE[pid]

####

def get_symbol_value(elffile, sym_name):
    section = elffile.get_section_by_name('.dynsym')
    if section:
        symbol = section.get_symbol_by_name(sym_name)
        if symbol:
            return symbol[0].entry.st_value
        else:
            return None
    else:
        return None

def get_all_bash_commands():
    """
        return all bash commands found in PATH/built-ins/alias/..., i.e. anything that can appear before the first space in a command line
    """
    return [a.decode('utf-8') for a in subprocess.check_output(['bash', '-c', 'compgen  -abckA function']).splitlines()]

####

def get_bash_line(bash_pid, rl_line_buffer_addr, rl_point_addr):
    ptrace_attach(bash_pid)
    mem_file=open("/proc/" + str(bash_pid) + "/mem", 'rb', 0)
    mem_file.seek(rl_line_buffer_addr)
    data = mem_file.read(8)
    rl_line_buffer_heap_addr = int.from_bytes(data, byteorder='little')

    mem_file.seek(rl_line_buffer_heap_addr)
    data = mem_file.read(256)
    line = data[:data.find(b'\x00')].decode('utf-8')

    mem_file.seek(rl_point_addr)
    data = mem_file.read(8)
    point = int.from_bytes(data, byteorder='little')

    mem_file.close()

    return line, point

def my_before_sleep(retry_state):
    # Taken & modified from before_sleep_log in tenacity/before_sleep.py
    if retry_state.outcome.failed:
        verb, value = 'raised', retry_state.outcome.exception()
    else:
        verb, value = 'returned', retry_state.outcome.result()

    logger.debug(
        "Retrying %s in %sms (attempt: %s) as it %s %s[%s]." %
        (get_callback_name(retry_state.fn),
        int(getattr(retry_state.next_action, 'sleep') * 1000),
        retry_state.attempt_number,
        verb, value.__class__.__name__, value))

@retry(
    reraise=True,
    stop=stop_after_attempt(2),
    wait=wait_random(min=0.01, max=0.04),
    retry=retry_if_exception_type(PermissionError),
    before_sleep=my_before_sleep)
def get_bash_line_retry(*args):
    return get_bash_line(*args)

def get_tmux_bash_pid(session):
    # out = subprocess.check_output(['tmux', 'list-panes', '-s', '-t', session, '-F', "#{pane_active} #{pane_pid}"])
    out = subprocess.check_output(['tmux', 'list-window', '-t', session, '-F', "#{window_active} #{pane_pid}"])
    # print('out', out)
    out2 = [l.split(' ') for l in out.decode().splitlines()]
    # print('out2', out2)
    for active, pid in out2:
        if active == '1':
            return int(pid)

    return None

def detect_tmux(bash_pid):
    try:
        children_pids = get_children_of_pid(bash_pid)
        if len(children_pids) == 1:
            child_pid = children_pids.pop()
            exe = os.readlink('/proc/%s/exe' % child_pid)
            if exe == shutil.which('tmux'):
                with open('/proc/%s/cmdline' % child_pid, 'r') as f:
                    cmdline = f.read()
                    cmdline = cmdline.split('\x00') # /proc/<PID>/cmdline separated by NULL
                if '-t' in cmdline:
                    session = cmdline[cmdline.index('-t') + 1]
                    tmux_bash_pid = get_tmux_bash_pid(session)
                    # print("tmux_bash_pid", tmux_bash_pid)
                    tmux_bash_pid_exe = os.readlink('/proc/%s/exe' % tmux_bash_pid)
                    if tmux_bash_pid and tmux_bash_pid_exe == shutil.which('bash'):
                        return True, tmux_bash_pid
        return False, None
    except Exception as e:
        logger.exception(e)
        return False, None


def get_dynamic_libs(pid, is_pie=False):
    f = open('/proc/%d/maps' % pid, 'r')
    c = f.readlines()
    f.close()

    ret = []
    for cc in c:
        parts = cc.strip().split()
        if len(parts) == 6:
            ret.append(parts[-1])
    ret = list(set(ret))
    ret.sort()
    exe = os.readlink('/proc/%d/exe' % pid)
    ret = [r for r in ret if not ((r == exe and not is_pie) or (r.startswith('[') and r.endswith(']')))]
    ret.sort()
    return ret

# Assume pids are not recycled
@functools.lru_cache(maxsize=128, typed=False)
def get_base_addr_of_loaded_dynamic_lib(pid, lib_path):
    f = open('/proc/%d/maps' % pid, 'r')
    c = f.readlines()
    f.close()

    ret = []
    for cc in c:
        parts = cc.strip().split()
        if len(parts) == 6 and parts[-1] == lib_path:
            addrs = parts[0].split('-')
            return int(addrs[0], 16)
    return None

def get_relevant_lib_and_offset(pid, symbol_name, is_pie=False):
    libs = get_dynamic_libs(pid, is_pie)
    relevant_lib = None
    relevant_offset = None
    for l in libs:
        try:
            f = open(l, 'rb')
            elffile = ELFFile(f)
        except Exception as e:
            # print("exception", l, e)
            pass
        else:
            sym = get_symbol_value(elffile, symbol_name)
            if sym:
                relevant_lib = l
                relevant_offset = sym
                # print(l, '----->',  hex(sym))
            else:
                # print(l, 'not found')
                pass
        finally:
            f.close()
    return relevant_lib, relevant_offset

def get_children_of_pid(pid):
    pid_childrens = defaultdict(set)
    pids = [int(x) for x in os.listdir('/proc/') if x.isdigit()]
    # print('a', pids)
    for p in pids:
        try:
            with open('/proc/%s/stat' % p, 'r') as f:
                data = f.read()
                rpar = data.rfind(')')
                dset = data[rpar + 2 : ].split()
                ppid = int(dset[1])
                # print("Adding %s to %s's children" % (p, ppid))
                pid_childrens[ppid].add(p)
        except Exception as e:
            pass
    return pid_childrens[pid]

class BashInfo:
    def __init__(self, **kwargs):
        self.bash_pid = kwargs['bash_pid']
        self.rl_line_buffer_addr = kwargs['rl_line_buffer_addr']
        self.rl_point_addr = kwargs['rl_point_addr']
        self.rl_line_buffer_lib = kwargs['rl_line_buffer_lib']
        self.rl_point_lib = kwargs['rl_point_lib']
        self.rl_line_buffer_offset = kwargs['rl_line_buffer_offset']
        self.rl_point_offset = kwargs['rl_point_offset']

    def get_interacting_bash_state(self):
        " Return the infomation (pid, rl_line_buffer_addr, rl_point_addr) of the currently interacting bash process, accounting for tmux presence "
        bash_pid = self.bash_pid
        detected_tmux, tmux_bash_pid = detect_tmux(self.bash_pid)
        if detected_tmux:
            bash_pid = tmux_bash_pid

            if self.rl_line_buffer_lib and self.rl_line_buffer_offset:
                rl_line_buffer_addr = get_base_addr_of_loaded_dynamic_lib(tmux_bash_pid, self.rl_line_buffer_lib) + self.rl_line_buffer_offset
            else:
                rl_line_buffer_addr = self.rl_line_buffer_addr

            if self.rl_point_lib and self.rl_point_offset:
                rl_point_addr = get_base_addr_of_loaded_dynamic_lib(tmux_bash_pid, self.rl_point_lib) + self.rl_point_offset
            else:
                rl_point_addr = self.rl_point_addr
        else:
            rl_line_buffer_addr = self.rl_line_buffer_addr
            rl_point_addr = self.rl_point_addr

        return bash_pid, rl_line_buffer_addr, rl_point_addr

class GetBashLineHandler(tornado.web.RequestHandler):
    def initialize(self, bash_info):
        self.bash_info = bash_info

    def get(self):
        try:
            bash_pid, rl_line_buffer_addr, rl_point_addr = self.bash_info.get_interacting_bash_state()
            line, point = get_bash_line_retry(bash_pid, rl_line_buffer_addr, rl_point_addr)
        except Exception as e:
            logger.exception(e)
            raise tornado.web.HTTPError
        else:
            self.write({
                "line": line,
                "point": point
            })
        finally:
            ptrace_detach(bash_pid)
        # self.write("Hello world {} ".format(self.pid))

class GetAllCommandHandler(tornado.web.RequestHandler):
    def get(self):
        self.write({
            'data': get_all_bash_commands()
        })

# Declared here because can't pickle lambda
def get_pybcompgen_complete(line, cwd, show_all):
    return pybcompgen.complete(line, cwd, show_all)

class AutoCompleteHandler(tornado.web.RequestHandler):
    def initialize(self, bash_info, executor):
        self.bash_info = bash_info
        self.executor = executor

    async def get(self):
        try:
            bash_pid, rl_line_buffer_addr, rl_point_addr = self.bash_info.get_interacting_bash_state()
            line, point = get_bash_line_retry(bash_pid, rl_line_buffer_addr, rl_point_addr)
        except Exception as e:
            logger.exception(e)
            raise tornado.web.HTTPError
        finally:
            ptrace_detach(bash_pid)

        try:
            readlink_dir = '/proc/{}/cwd'.format(bash_pid)
            cwd = os.readlink(readlink_dir)
            # logger.info('cwd: {}, {}'.format(readlink_dir, cwd))
            line = line[:point]

            if self.get_query_argument('show_all', None):
                fut = IOLoop.current().run_in_executor(self.executor, get_pybcompgen_complete, line, cwd, True)
            else:
                fut = IOLoop.current().run_in_executor(self.executor, get_pybcompgen_complete, line, cwd, False)
            ret = await fut

            ret.sort(key=lambda s: s.lower())

            # TODO: limit ret to return only a few instead of all?

            self.write({
                'data': ret,
                'line': line,
                'point': point,
            })
        except Exception as e:
            logger.error(e)
            raise tornado.web.HTTPError


def restart_program():
    # From https://www.daniweb.com/programming/software-development/code/260268/restart-your-python-program
    """Restarts the current program.
    Note: this function does not return. Any cleanup action (like
    saving data) must be done before calling this function."""
    python = sys.executable
    os.execl(python, python, *sys.argv)

class MyTermSocket(TermSocket):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

    def on_pty_died(self):
        super().on_pty_died()
        time.sleep(3)
        IOLoop.current().stop()

        # get all child pids (by ProcessPoolExecutor)
        children_pids = get_children_of_pid(os.getpid())
        # print("children_pids", os.getpid(), children_pids)

        for pid in children_pids:
            os.kill(pid, signal.SIGTERM)

        time.sleep(1)
        logger.info("Restarting server....")
        restart_program()

from tornado.options import define, options
define("host", default="127.0.0.1", help="Listen interface")
define("port", default=8010, help="Listen port")

if __name__ == '__main__':
    # Ignore this signal SIGTTIN because sometimes when bash process spawned by pybcompgen
    # timeout, it sends this signal to app.py, causing app.py to stop (put to background)
    # NOTE no longer needed because Popen use start_new_session (the spawned bash is a new process group),
    # the signal will not send to app.py
    # signal.signal(signal.SIGTTIN, signal.SIG_IGN)

    tornado.options.parse_command_line()

    print(r'''
        ███████╗██╗    ██╗███████╗██╗     ██╗        ███████╗██╗  ██╗
        ██╔════╝██║    ██║██╔════╝██║     ██║        ██╔════╝██║  ██║
        ███████╗██║ █╗ ██║█████╗  ██║     ██║        ███████╗███████║
        ╚════██║██║███╗██║██╔══╝  ██║     ██║        ╚════██║██╔══██║
        ███████║╚███╔███╔╝███████╗███████╗███████╗██╗███████║██║  ██║
        ╚══════╝ ╚══╝╚══╝ ╚══════╝╚══════╝╚══════╝╚═╝╚══════╝╚═╝  ╚═╝
    ''')


    bash_path = shutil.which('bash')
    if not bash_path:
        logger.error("Bash executable not found in PATH")
        logger.error("Quiting...")
        sys.exit(1)
    else:
        logger.info("Bash path: {}", bash_path)

    term_manager = SingleTermManager(shell_command=['bash'])
    bash_pid = term_manager.get_terminal().ptyproc.pid
    logger.info("bash pid is {}", bash_pid)

    elffile = ELFFile(open(bash_path, 'rb'))

    rl_line_buffer_addr = None
    rl_point_addr = None

    bash_is_pie = elffile.header['e_type'] == 'ET_DYN'
    if not bash_is_pie:
        rl_line_buffer_addr = get_symbol_value(elffile, 'rl_line_buffer')
        rl_point_addr = get_symbol_value(elffile, 'rl_point')

    elffile.stream.close()

    rl_line_buffer_lib, rl_line_buffer_offset = (None, None)
    rl_point_lib, rl_point_offset = (None, None)

    if not rl_line_buffer_addr or not rl_point_addr:
        # maybe the readline lib of bash executable is not statically linked, check the dynamic libs
        # Or the bash is PIE
        rl_line_buffer_lib, rl_line_buffer_offset = get_relevant_lib_and_offset(bash_pid, 'rl_line_buffer', bash_is_pie)
        rl_point_lib, rl_point_offset = get_relevant_lib_and_offset(bash_pid, 'rl_point', bash_is_pie)

        # print('1', rl_line_buffer_lib, rl_line_buffer_offset)
        # print('2', rl_point_lib, rl_point_offset)

        if rl_line_buffer_lib and rl_point_lib and rl_line_buffer_offset and rl_point_offset:
            rl_line_buffer_addr = get_base_addr_of_loaded_dynamic_lib(bash_pid, rl_line_buffer_lib) + rl_line_buffer_offset
            rl_point_addr = get_base_addr_of_loaded_dynamic_lib(bash_pid, rl_point_lib) + rl_point_offset

        if not rl_line_buffer_addr or not rl_point_addr:
            logger.error("The bash executable does not contain necessary information for server to function properly")
            logger.error("Quiting...")
            sys.exit(1)

    logger.info("rl_line_buffer_addr: {}", hex(rl_line_buffer_addr))
    logger.info("rl_point_addr: {}", hex(rl_point_addr))


    bash_info = BashInfo(
        bash_pid=bash_pid,
        rl_line_buffer_addr=rl_line_buffer_addr,
        rl_point_addr=rl_point_addr,
        rl_line_buffer_lib=rl_line_buffer_lib,
        rl_point_lib=rl_point_lib,
        rl_line_buffer_offset=rl_line_buffer_offset,
        rl_point_offset=rl_point_offset,
    )
    # pprint(bash_info.__dict__)

    if "com.termux" in os.environ.get("PREFIX", ""):
        logger.info("Termux detected, using ThreadPoolExecutor")
        executor = concurrent.futures.ThreadPoolExecutor()
    else:
        executor = concurrent.futures.ProcessPoolExecutor()

    handlers = [
        (r"/websocket", MyTermSocket, {'term_manager': term_manager}),
        (r"/compgen", GetAllCommandHandler),
        (r"/line", GetBashLineHandler, {'bash_info': bash_info}),
        (r"/autocomplete", AutoCompleteHandler, {'bash_info': bash_info, 'executor': executor}),
        (r"/()", tornado.web.StaticFileHandler, {'path':'./static/index.html'}),
        (r"/(.*)", tornado.web.StaticFileHandler, {'path':'./static/'}),
    ]
    app = tornado.web.Application(handlers, compress_response=True)
    app.listen(options.port, options.host)
    logger.info("Listening on port {}:{}".format(options.host, options.port))
    IOLoop.current().start()

