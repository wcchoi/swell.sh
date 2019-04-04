# Acknowledgement:

This project makes use of the following libraries/codes:

## Front-end
- [Xterm.js](https://xtermjs.org/)
- [jQuery](https://jquery.com/)
- [Lodash](https://lodash.com/)
- [SVG.js](https://svgjs.com/)
- [mobile-chrome-vh-fix](https://github.com/Stanko/mobile-chrome-vh-fix)
- [ES6-Promise](https://github.com/stefanpenner/es6-promise)
- [Pointer Events Polyfill](https://github.com/jquery/PEP)
- [ReconnectingWebSocket](https://github.com/joewalnes/reconnecting-websocket)
- [iziToast](http://izitoast.marcelodolce.com/)
- [FastClick](https://github.com/ftlabs/fastclick)
- [window.fetch polyfill](https://github.com/github/fetch)

## Backend
- [Terminado](https://github.com/jupyter/terminado)
- [pyelftools](https://github.com/eliben/pyelftools)
- `pybcompgen.py` - code for getting the bash completion suggestion 
    - It is taken from [mattvonrocketstein/smash](https://github.com/mattvonrocketstein/smash) - see [https://github.com/mattvonrocketstein/smash/blob/master/smashlib/bin/pybcompgen.py](https://github.com/mattvonrocketstein/smash/blob/master/smashlib/bin/pybcompgen.py), the one used in this project is modified a bit
- Some ptrace-related code is taken from the project [memorpy](https://github.com/n1nj4sec/memorpy)
    - Particularly [https://github.com/n1nj4sec/memorpy/blob/master/memorpy/LinProcess.py](https://github.com/n1nj4sec/memorpy/blob/master/memorpy/LinProcess.py)
- Some code for parsing procfs files to obtain child processes is from [psutil](https://github.com/giampaolo/psutil) 
    - See `ppid_map` from [https://github.com/giampaolo/psutil/blob/master/psutil/_pslinux.py](https://github.com/giampaolo/psutil/blob/master/psutil/_pslinux.py)
- [Loguru](https://github.com/Delgan/loguru)
- [Tenacity](https://github.com/jd/tenacity)
