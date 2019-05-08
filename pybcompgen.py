#!/usr/bin/env python
"""
https://github.com/mattvonrocketstein/smash

The MIT License (MIT)

Copyright (c) 2014 matthew von rocketstein

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""

""" pybcompgen

    Pybcompgen calculates context sensitive tab-completion data which is
    derived from environment bash system settings.  It doesn't need to know
    anything about whether you use /etc/completion or /etc/bash_completion.d,
    all that matters is whether *bash* knows about the completion.  The benefit
    of doing this are obvious: you get access to all the completion features
    that the system has installed without caring how the completion features
    work.  Note that this approach doesn't just work for things in the users
    $PATH, it works for arbitrary complex completion. In the default linux
    installations, completion normally includes everything from
    git-subcommands to debian packages, depending on context.

    Example I/O:

       $ pybcompgen "/et"
       ["/etc "]

       $ pybcompgen "git lo"
       ["log"]

       $ pybcompgen "apt-ge"
       ["apt-get "]

       $ pybcompgen "apt-get inst"
       ["install "]

       $pybcompgen "apt-get install ubuntu-art"
       ["ubuntu-artwork "]
"""

"""
Swell.sh changes:

1. Python 3
2. Use specific input rc file
3. Some changes to the parsing of bash output to make it work on more cases
4. Add the void function to prevent accidentally running the command

"""
import sys
import unicodedata
from subprocess import Popen, PIPE, DEVNULL, TimeoutExpired
import os
import signal
import re
import shutil
import shlex

from functools import reduce

import pprint

# def remove_control_characters(s):
#     return "".join(ch for ch in s if unicodedata.category(ch)[0]!="C")

ansi_escape = re.compile(r'\x1b\[C')


def remove_control_characters(s):
    s = ansi_escape.sub('', s)
    s = s.replace('[1@#', '')
    return "".join(ch for ch in s if unicodedata.category(ch)[0] != "C")

# NOTE: by adding the void here,
# if bash-completion package is not installed, `complete` won't suggest commands
# so in that case make sure {to_complete} already contains command + ' ' + xxx
CMD_TMPL = [
    #'cd {cwd}',
    'void(){{ :; }}',
    'declare -F _command &>/dev/null && complete -F _command void',
    'echo MARKER',
    'void {complete}\t\x01#',
    'echo MARKER',
]
CMD_TMPL = '\n'.join(CMD_TMPL)

BASH_PATH = shutil.which('bash')

def complete(to_complete, cwd=None):
    """ wow! so this is stupid, but what can you do? to understand
        the command required to get completion information out of bash,
        start by executing "printf '/et\x09\x09' | bash -i".  What this
        command does is put bash into interactive mode, then simulate
        typing "/et<tab><tab>" inside bash.  The tab-completion information
        can scraped out of the text, but several things complicate the final
        solution:

        1) the tab-completion info, apart from being post-processed, must be
           scraped from stderr, not from stdout.

        2) for post-processing, without knowledge of how the prompt will be
           rendered or if there is some kind of banner that will be printed,
           it's hard to know where exactly to start capturing tab-completion
           options.

        3) the method used to get the tab completion involves the bash builtins
           "printf", meaning we have to launch subprocess with "bash -c"

        4) completion output could be paginated by bash if there are lots of
           options.  have to account for that and still try to get all the
           options instead of just the first page

        5) sending EOF does not working unless it comes after a newline.  this
           means we have to take extra steps to avoid actually executing the
           command we want to complete (executing the command is not what the
           user expects and is possibly unsafe).  to avoid executing the line,
           after getting tab completion you have to simulate control-a (go to
           start of line) followed by '#'.  this comments the line and prevents
           it from executing.  note: you cannot send control-c to cancel the
           execution of the line because we are dealing with pipes, whereas
           control-c is processed only by proper tty's.
    """
    if not to_complete:
        return []

    my_env = {}
    my_env['HISTFILE'] = '/dev/null'
    my_env['HOME'] = os.environ.get('HOME')
    if os.environ.get("LD_LIBRARY_PATH"):
        my_env['LD_LIBRARY_PATH'] = os.environ.get('LD_LIBRARY_PATH')
    my_env['INPUTRC'] = os.path.join(os.getcwd(), 'myinputrc')
    # print(my_env)

    if not cwd:
        cwd = os.getcwd()

    cmd = '''{bash} -c "printf '{cmd_tmpl}'| bash -i"'''.format(cmd_tmpl=CMD_TMPL, bash=BASH_PATH)
    cmd = cmd.format(cwd=cwd, complete=to_complete)

    p1 = Popen(shlex.split(cmd), shell=False, stdout=PIPE, stdin=DEVNULL, stderr=PIPE, env=my_env, cwd=cwd, start_new_session=True)
    try:
        # print("spawning", p1.pid)
        out, err = p1.communicate(timeout=1)
    except TimeoutExpired as e:
        # print("timeout, terminating", p1.pid)
        # p1.terminate()
        os.killpg(os.getpgid(p1.pid), signal.SIGTERM) # kill the subprocesses (i.e. bash -i) as well
        p1.wait()
        out, err = p1.communicate()
        raise e

    err = err.decode('utf-8')

    # print(err)
    lines = err.split('\n')
    for i in range(len(lines)):
        l = lines[i]
        idx = l.find('\r')
        if idx > -1:
            lines[i] = lines[i][:idx]

    #lines = err.splitlines()

    #pprint.pprint(lines)

    first_marker = None
    last_marker = None
    for i in range(len(lines)):
        line = lines[i]
        if line.strip().endswith('echo MARKER'):
            if first_marker is None:
                first_marker = i
            else:
                last_marker = i

    # SPECIAL CASE: pagination
    if last_marker is None:
        # when this happens there are too many options,
        # ie bash is asking something like this:
        #   Display all 103 possibilities? (y or n)
        # Pagination indicators like '--More--'must be removed
        lines = [line for line in lines if not line.startswith('--More')]
        last_marker = len(lines) - 3
        first_marker+=1

    complete_lines = lines[first_marker+2:last_marker-1]

    #import bpdb; bpdb.set_trace()
    #SPECIAL-CASE: no completion options or only one option
    if not complete_lines:
        # NOTE:
        #   if there is only one option, readline simply applies it,
        #   which affects the current line in place.  apparently this
        #   results in tons of control-characters being dumped onto
        #   the line, and we have to clean those up for the output
        try:
            the_line = lines[first_marker+1:last_marker][0]
        except IndexError as e:
            print("IndexError")
            return []

        the_line = remove_control_characters(the_line)
        tmp = the_line[the_line.rfind(to_complete)+len(to_complete):]
        if to_complete.endswith(' '):
            # result = to_complete.split()[-1] + ' ' + tmp
            result = tmp
        else:
            result = to_complete.split()[-1] + tmp
        if '#' in result:
            # this seems to only happen for directories.  not sure why
            result = result[:result.find('#')]
        if result == to_complete.split()[-1]:
            #SPECIAL-CASE: no completion options at all.
            return []

        # Sometimes it outputs duplicated things, eg: 'app.py app.py '
        parts = result.split(' ')
        if len(parts) == 3 and parts[0] == parts[1]:
            result = parts[0]

        return [result]
    else:
        # there are multiple completion options
        completion_choices_by_row = [x.split() for x in complete_lines]
        completion_choices = reduce(lambda x,y:x+y, completion_choices_by_row)
        return completion_choices

if __name__=='__main__':
    # if being called from the command line, output json
    # so it is easier for another application to consume
    import json
    result = complete(sys.argv[-1])
    print(json.dumps(result))
