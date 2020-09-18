window.APPSTATE = {
    mode: 'bash',
    insideTmux: false,
}

var nullfn = function () {
    console.log("called nullfn")
    return null;
}

function isNullOrUndefined(x) {
    return _.isUndefined(x) || _.isNull(x);
}

var _updateCompleter = {}
_updateCompleter['bash'] = function(suggestions, prefix, reupdateCompleter, addSpaceAtEnd, isSwipe) {
    var c = document.getElementById('completer')
    var s = ["<ul class='candidates'>"]
    suggestions.forEach(function (sugg) {
        s.push("<li class='suggestion' data-value='"+ sugg.word  +"'><strong>" + sugg.word  + "</strong></li>")
    })
    s.push("</ul>")

    requestAnimationFrame(function(){
        c.innerHTML = ''
        c.innerHTML = s.join('')
        c.scrollLeft = 0
        var lastInput = prefix
        var firstClick = true
        $('.suggestion').on('click', function (evt) {
            var word = evt.currentTarget.dataset.value
            if(lastInput) {
                Terminal.backspaceNTimes(lastInput.length)
            }
            lastInput = word
            if(addSpaceAtEnd) {
                lastInput += ' ' // input an extra space at the end
            }
            Terminal.insertWord(lastInput, (firstClick && isSwipe) ? false : reupdateCompleter)
            if(firstClick) firstClick = false
        })
    })
}

_updateCompleter['vim'] = function(suggestions, prefix, reupdateCompleter, addSpaceAtEnd, isSwipe) {
    var c = document.getElementById('completer')
    var s = ["<ul class='candidates'>"]
    if(!isSwipe && suggestions.length > 0) {
        s.push("<li class='suggestion refresh-suggestion'>&circlearrowright;</li>")
    }
    suggestions.forEach(function (sugg) {
        s.push("<li class='suggestion' data-index='"+ sugg.index  +"'><strong>" + sugg.word  + "</strong></li>")
    })
    s.push("</ul>")
    requestAnimationFrame(function(){
        c.innerHTML = ''
        c.innerHTML = s.join('')
        var refreshEl = document.querySelector('.suggestion, .refresh-suggestion')
        if (refreshEl && !isSwipe) {
            c.scrollLeft = refreshEl.offsetWidth - 4
        } else {
            c.scrollLeft = 0
        }
        var firstClick = true
        $('.refresh-suggestion').on('click', function(evt) {
            // looks like if too fast, will err
            Terminal.insertCtrl('X')();
            setTimeout(Terminal.insertCtrl('F'), 300);
            setTimeout(autocompletefn, 500);
        })
        $('.suggestion:not(.refresh-suggestion)').on('click', function (evt) {
            var index = evt.currentTarget.dataset.index;

            var body = {index: Number(index)}
            if(isSwipe) body.dont_finish = true

            fetch('/nvim_select_suggestion', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            }).then(function(resp) {
                if(!(firstClick && isSwipe)) {
                    autocompletefn()
                }
                if(firstClick) firstClick = false
            }).catch(function(err) {
                console.error("nvim_select_suggestion error:", err);
            })
        })
    })
}

var updateCompleter = function(suggestions, prefix, reupdateCompleter, addSpaceAtEnd, isSwipe) {
    if(!prefix) prefix = ''
    if(isNullOrUndefined(reupdateCompleter)) reupdateCompleter = false
    if(isNullOrUndefined(addSpaceAtEnd)) addSpaceAtEnd = false
    if(isNullOrUndefined(isSwipe)) isSwipe = false

    if (window.APPSTATE.mode === 'bash') {
        _updateCompleter['bash'](suggestions, prefix, reupdateCompleter, addSpaceAtEnd, isSwipe)
    } else if (window.APPSTATE.mode === 'vim') {
        _updateCompleter['vim'](suggestions, prefix, reupdateCompleter, addSpaceAtEnd, isSwipe)
    }
}

var showErrorCompleter = function(err) {
    var c = document.getElementById('completer')
    requestAnimationFrame(function(){
        c.innerHTML = '<div class="completerError">'+err+'</div>'
    })
}

var Analyzer = (function() {
    var worker
    var promiseResolve, promiseReject
    var latestTS

    var initialize = function() {
        worker = new Worker("worker.js")
        worker.onmessage = function (e) {
            var msg = e.data
            if(msg.debug){
                // console.log(msg.debug)
                // alert(msg.debug)
                if(msg.debug.pathToDraw){
                    var colors = ['rgba(255,0,0,0.5)', 'rgba(0,255,0,0.5)', 'rgba(0,0,255,0.5)']
                    drawPath(msg.debug.pathToDraw, colors[msg.debug.colorNum % colors.length])
                } else if(msg.debug.clearPath) {
                    clearPath()
                }
            } else if(msg.process_state_change){
                console.log('process_state_change', msg.process_state_change)
                window.APPSTATE.mode = msg.process_state_change.mode
                window.APPSTATE.insideTmux = msg.process_state_change.insideTmux
                Keyboard.switchMode(window.APPSTATE.mode)
                autocompletefn()
            } else {
                if(msg.err) {
                    promiseReject(msg.err)
                } else {
                    if(msg.ts === latestTS) {
                        promiseResolve(msg.data)
                    } else {
                        console.warn("Out of order", msg.ts, latestTS)
                    }
                }
            }
        }
        window.worker = worker
    }

    //make Web Worker promise
    var makeWWPromise = function(msg) {
        var promise = new Promise(function (resolve, reject) {
            latestTS = Date.now()
            msg['ts'] = latestTS
            worker.postMessage(msg)
            promiseResolve = resolve
            promiseReject = reject
        })
        return promise
    }

    var gestureRecognize = function(inputpath, completions, mode, shouldAddToDictionary) {
        return makeWWPromise({fn: "gestureRecognize", args: [inputpath, completions, mode, shouldAddToDictionary]})
    }

    var getSwipeSuggestions = function(inputpath, isUpperCase) {
        return makeWWPromise({fn: "getSwipeSuggestions", args: [inputpath, isUpperCase]})
    }

    var getKeySuggestions = function() {
        return makeWWPromise({fn: "getKeySuggestions", args: []})
    }

    return {
        initialize: initialize,
        gestureRecognize: gestureRecognize,
        getKeySuggestions: getKeySuggestions,
        getSwipeSuggestions: getSwipeSuggestions,
    }
})()
Analyzer.initialize()

var autocompletefn = _.debounce(function() {
    Analyzer.getKeySuggestions()
        .then(function(data) {
            if(data.completions && data.completions.length > 0) {
                var compl = data.completions.slice(0,10).map(function(word, index) {
                    return {
                        word: word,
                        index: index
                    }
                })
                updateCompleter(compl, data.prefix, data.reupdateCompleter, data.addSpaceAtEnd)
            } else {
                updateCompleter([]) //clear it
            }
        }).catch(function(err){
            console.log('autocompletefn err:', err)
            showErrorCompleter("Can't fetch from server, please try again...");
        })
}, 300)

var Terminal = (function(term) {
    var xtermDataHandler = function(s) {
        term._core._coreService.triggerDataEvent(s, true)
    }
    var delGroupBefore = function() {
        xtermDataHandler('\x17') // CTRL-W
        autocompletefn()
    }
    var insertWord = function(word, shouldUpdateCompleter) {
        if(typeof shouldUpdateCompleter === 'undefined') shouldUpdateCompleter = true
        for(var i = 0; i < word.length; i++) {
            var c = word[i]
            xtermDataHandler(c[0]);
        }
        if(shouldUpdateCompleter) {
            autocompletefn()
        }
    }
    var insert = function(c) {
        return function(){
            xtermDataHandler(c[0]);
            autocompletefn()
        }
    }
    var insertSp = function(which, shouldUpdateCompleter) {
        return function(){
            if(typeof shouldUpdateCompleter === 'undefined') shouldUpdateCompleter = true
            xtermDataHandler(String.fromCharCode(which));

            if(shouldUpdateCompleter) {
                autocompletefn()
            }
        }
    }
    var insertSp2 = function(which) {
        return function(){
            xtermDataHandler(String.fromCharCode(0x1b) + which);

            autocompletefn()
        }
    }
    var insertCtrl = function(c) {
        return function(){
            xtermDataHandler(String.fromCharCode(c.charCodeAt(0) - 64))
            autocompletefn()
        }
    }
    var insertAlt = function(c) {
        return function(){
            xtermDataHandler(String.fromCharCode(0x1b) + c[0].toLowerCase())
            autocompletefn()
        }
    }
    var setFontSize = function(size) {
        var termContainer = term.element.parentElement
        var origHeight = termContainer.offsetHeight;
        termContainer.style.height = origHeight + "px";
        term.setOption("fontSize", size)
        term.fitAddon.fit()
        setTimeout(function() {
            term.scrollToBottom();
        }, 0)
    }
    var configFontSize = function() {
        function genSelect() {
            var fontSize = localStorage.getItem('terminal-font-size') || 12;
            fontSize = Number(fontSize)
            return '<select>' +
                        '<option value="12"' + (fontSize === 12 ? 'selected' : '')  + '>12</option>' +
                        '<option value="14"' + (fontSize === 14 ? 'selected' : '')  + '>14</option>' +
                        '<option value="16"' + (fontSize === 16 ? 'selected' : '')  + '>16</option>' +
                        '<option value="18"' + (fontSize === 18 ? 'selected' : '')  + '>18</option>' +
                        '<option value="20"' + (fontSize === 20 ? 'selected' : '')  + '>20</option>' +
                    '</select>'
        }
        iziToast.info({
            timeout: false,
            overlay: true,
            displayMode: 'once',
            id: 'inputs',
            zindex: 999,
            animateInside: false,
            title: 'Select Font Size',
            position: 'center',
            drag: false,
            inputs: [
                [
                    genSelect(),
                    'change',
                    function (instance, toast, select, e) {
                        var fontSize = Number(select.options[select.selectedIndex].value);
                        localStorage.setItem('terminal-font-size', fontSize);
                        setFontSize(fontSize);
                        instance.hide({ transitionOut: 'fadeOut' }, toast);
                    }
                ],
            ]
        });
    }
    var inputNonEnglish = function() {
        // Don't show the orientation check thing when the keyboard popup
        // We assume that up to this point the app is usable
        document.querySelector('#checkOrientation').style.display = 'none';
        document.querySelector('#app').style.display = 'initial';

        iziToast.info({
            timeout: false,
            overlay: true,
            displayMode: 'once',
            id: 'textinputs',
            zindex: 999,
            animateInside: false,
            position: 'center',
            drag: false,
            inputs: [
                ['<input type="text" placeholder="Input Text">'],
            ],
            buttons: [
                ['<button><b>Confirm</b></button>', function (instance, toast, button, e, inputs) {
                    var text = inputs[0].value;
                    console.log('Text field: ' + text);
                    xtermDataHandler(text);
                    instance.hide({ transitionOut: 'fadeOut' }, toast, 'button');
                }, false], // true to focus
            ]
        });
    }
    var newLine = insert('\r')
    var backspace = insertSp(8)
    var escape = insertSp(0x1b)
    var backspaceNTimes = function(n) {
        for(var i = 0; i < n; i++) {
            insertSp(8, false)();
        }
    }
    var moveCursorUp = insertSp2('OA')
    var moveCursorDown = insertSp2('OB')
    var moveCursorRight = insertSp2('OC')
    var moveCursorLeft = insertSp2('OD')
    var insertSoftTab = insert('\t')
    var deleteKey = insertSp2('[3~')

    return {
        delGroupBefore: delGroupBefore,
        insertWord: insertWord,
        insert: insert,
        insertSp: insertSp,
        insertSp2: insertSp2,
        insertCtrl: insertCtrl,
        insertAlt: insertAlt,
        setFontSize: setFontSize,
        configFontSize: configFontSize,
        newLine: newLine,
        backspace: backspace,
        escape: escape,
        backspaceNTimes: backspaceNTimes,
        moveCursorUp: moveCursorUp,
        moveCursorDown: moveCursorDown,
        moveCursorRight: moveCursorRight,
        moveCursorLeft: moveCursorLeft,
        insertSoftTab: insertSoftTab,
        inputNonEnglish: inputNonEnglish,
        deleteKey: deleteKey,
    }
})(window.term)

var Keyboard = (function (Terminal, Analyzer) {
    //ds stands for down state
    //cp stands for current pt

    var SwipeAction = (function() {
        var swipePath = (function() {
            // path contains the points to draw on screen
            // to give the "evaporating path" effect
            // path [pi .. pj(end pts inclusive)] are used
            var path =  new Array(256)
            var pi = 0
            var pj = 0
            // input path is for matching w/ gestures
            var inputpath = []

            var addPt = function (pt) {
                path[pj] = { x: pt.x, y: pt.y, v: 1 }
                inputpath.push({ x: pt.x, y: pt.y })
                pj = (pj+1)%256
            }

            var reset = function() {
                path =  new Array(256)
                pi = 0
                pj = 0
                inputpath = []
            }

            var getPath = function() {
                var ret = []
                for (var i = pi; i !== pj; i = (i + 1) % 256) {
                    ret.push(path[i])
                }
                return ret
            }

            var updatePath = function() {
                // update the opacity and remove unsed pts in path
                // ie. evaporate
                for (var i = pi; i !== pj; i = (i + 1) % 256) {
                    path[i].v *= 0.8
                    if (path[i].v < 0.01) {
                        pi = (pi + 1) % 256
                        // if(pi === pj) pi = pj-1
                    }
                }
            }

            var normalise = function(p) {
                return _.map(p, function(pt) { return {x: pt.x/_canvas.width, y: pt.y/_canvas.height} })
            }

            var getInputPath = function() {
                return normalise(inputpath)
            }

            return {addPt: addPt, reset: reset, getInputPath: getInputPath, updatePath:updatePath, getPath:getPath}
        })()

        // to make it about slower than 30 fps (34 ms)
        var rAf = null
        var prevTickTime = null //the start time of the whole swipe action
        var rate = 50//ms
        var timeAccumulator = 0

        var animateSwipe = function (timestamp) {
            rAf = requestAnimationFrame(animateSwipe)

            if(!prevTickTime) prevTickTime = timestamp

            var timeDifference = timestamp - prevTickTime
            prevTickTime = timestamp

            timeAccumulator += timeDifference

            var path = swipePath.getPath()
            if(path.length === 0) return

            //Simulation part begin:
            while(timeAccumulator >= rate){
                timeAccumulator -= rate
                swipePath.updatePath()
            }

            //Rendering part begin:
            _ctx.clearRect(0, 0, _canvas.width, _canvas.height)
            _ctx.lineWidth = 8

            // console.log(pi, pj)

            for (var i = 1; i < path.length; i++) {
                _ctx.beginPath()
                _ctx.lineJoin = 'round'
                _ctx.lineCap  = 'round'
                _ctx.strokeStyle = "rgba(100, 100, 255," + path[i].v + ")"
                _ctx.moveTo(path[i-1].x, path[i-1].y)
                _ctx.lineTo(path[i].x, path[i].y)
                _ctx.stroke()
                _ctx.closePath()
            }

            // swipePath.updatePath()
        }

        var start = function(downState, currPt) {
                swipePath.addPt({x: downState.pt.x * _canvas.width, y: downState.pt.y * _canvas.height})
                rAf = requestAnimationFrame(animateSwipe) // start the animation
        }

        var move = function(currPt) {
            swipePath.addPt({x: currPt.x * _canvas.width, y: currPt.y * _canvas.height})
        }

        var up = function(currPt) {
            // add this last point as well
            swipePath.addPt({x: currPt.x * _canvas.width, y: currPt.y * _canvas.height})

            var inputpath = swipePath.getInputPath()
            var intermediateData
            Analyzer.getSwipeSuggestions(inputpath, Keyboard.isUpperCase())
            .then(function(data) {
                intermediateData = data
                var shouldAddToDictionary = data.shouldAddToDictionary || true;
                return Analyzer.gestureRecognize(inputpath, data.completions, 'bash', shouldAddToDictionary)
            }).then(function(completions){
                // console.log(completions)
                var compl = _.map(completions, function(c) {
                    return {
                        word: c.word,
                        index: c.originalIndex
                    }
                })
                if(compl.length > 0) {
                    updateCompleter(compl, intermediateData.prefix, intermediateData.reupdateCompleter, intermediateData.addSpaceAtEnd, intermediateData.isSwipe)

                    // input the first suggestion, the firstClick flag will prevent reupdateCompleter
                    requestAnimationFrame(function(){
                        $('.suggestion').first().trigger('click')
                    })
                } else {
                    updateCompleter([]) //clear
                }
            }).catch(function(err){
                console.log('pointerup err:', err)
                updateCompleter([]) //clear it
                showErrorCompleter("Something went wrong, try again...");
            })

            // clean up
            cancelAnimationFrame(rAf)
            swipePath.reset()
            prevTickTime = null
            timeAccumulator = 0
        }

        return {
            start: start,
            move: move,
            up: up
        }
    })()

    var CursorAction = (function() {
        var downState = null
        var timeout = null
        var currPt = null
        var t = 150
        var cnt = 0
        var accelerateCnt = 20

        var deltaThreshold = 0.05 // width/height of key is 0.1, so half

        var moveCursor = function() {
            var delta = {x: currPt.x - downState.key.cx, y: currPt.y - downState.key.cy}
            if(delta.x > deltaThreshold) {
                Terminal.moveCursorRight()
            } else if (delta.x < -deltaThreshold) {
                Terminal.moveCursorLeft()
            } else if (delta.y > deltaThreshold) {
                Terminal.moveCursorDown()
            } else if (delta.y < -deltaThreshold) {
                Terminal.moveCursorUp()
            }

            cnt++
            if(cnt > accelerateCnt) t = 80
            timeout = window.setTimeout(moveCursor, t)
        }

        var start = function(ds, cp) {
            downState = ds
            if(downState.key.keyid === 'shiftcursor') {
                // pass
            }
            currPt = cp
            // timeout = window.setTimeout(moveCursor, t)
            moveCursor() //called immediately so that the first call is not 100ms later
        }

        var move = function(cp) {
            currPt = cp
        }

        var up = function(cp) {
            // clean up
            window.clearTimeout(timeout)
            // Terminal.setExtending(false)
            downState = null
            timeout = null
            currPt = null
            cnt = 0
            t = 100
        }

        return {
            start: start,
            move: move,
            up: up
        }

    })()

    // f is the repeat action
    var makeRepeatAction = function (f, timeInterval, accelerate, accelerateCnt, accelerateTimeInterval, accelerateFn) {
        return (function(){
            var timeout = null
            var cnt = 0

            if(!accelerateFn) accelerateFn = f
            var fnToExecuteNext = f

            var wrappedF = function(){
                fnToExecuteNext()
                cnt++
                if(accelerate && cnt > accelerateCnt){
                    fnToExecuteNext = accelerateFn
                    timeout = window.setTimeout(wrappedF, accelerateTimeInterval)
                } else {
                    timeout = window.setTimeout(wrappedF, timeInterval)
                }
            }


            var start = function(ds, cp) {
                wrappedF()
            }
            var move = function(cp) { /* empty */ }
            var up = function(cp) {
                window.clearTimeout(timeout)
                cnt = 0
                fnToExecuteNext = f
            }

            return {
                start: start,
                move: move,
                up: up
            }
        })()
    }

    var RepeatBackspaceAction = makeRepeatAction(Terminal.backspace, 100, true, 30, 75, Terminal.delGroupBefore)
    var RepeatNewlineAction = makeRepeatAction(Terminal.newLine, 100, false)
    var RepeatSpaceAction = makeRepeatAction(Terminal.insert(' '), 100, true, 10, 30)
    var RepeatCursorDownAction = makeRepeatAction(Terminal.moveCursorDown, 200, false)

    // normal size key
    var makeKey = function(fn, swipable, key, id) {
        id = id ? id : key
        return {
            keyid: id, keytext: key, w: 0.1, h: 0.25,
            click: fn,
            timeout: 400 /*ms*/,
            swipe: swipable ?
                {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up } :
                {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
            longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn }
        }
    }

    var makeRegularKey = function(key, id) {
        var swipable = true
        return makeKey(Terminal.insert(key), swipable, key, id)
    }
    var makeRegularNonSwipableKey = function(key, id) {
        var swipable = false
        return makeKey(Terminal.insert(key), swipable, key, id)
    }

    var makeUppercaseKey = function(key) {
        var swipable = true
        return makeKey(function() {Terminal.insert(key)(); switchLayout(0)}, swipable, key)
    }

    var makeCtrlKey = function(key) {
        var swipable = false
        return makeKey(function() {Terminal.insertCtrl(key.toUpperCase())(); switchLayout(0)}, swipable, key, 'ctrl-'+key)
    }

    var makeAltKey = function(key, id) {
        id = id ? id : key
        var swipable = false
        return makeKey(function() {Terminal.insertAlt(key)(); switchLayout(0)},
                       swipable, key, 'alt-'+id)
    }

    var modifyKeyLongPress = function(key, enter, move, up) {
        var newKey = key
        if (enter) newKey.longpress.onEnter = enter
        if (move) newKey.longpress.onMove = move
        if (up) newKey.longpress.onUp = up
        return newKey
    }

    var tmuxShortcutFn = function(key) {
        var tmuxPrefix = 'b'
        return function() {
            if (window.APPSTATE.insideTmux) {
                Terminal.insertCtrl(tmuxPrefix.toUpperCase())();
                Terminal.insert(key)();
            }
        }
    }

    var nothingCnt = 0
    var makeNothingKey = function() {
        nothingCnt++;
        var swipable = false
        return makeKey(nullfn, swipable, ' ', 'nothing'+nothingCnt)
    }

    var makeKeyRow = function(cxOffset, cy, keys) {
        keys = _.cloneDeep(keys)
        var cx = cxOffset
        var row = keys.map(function(key) {
            cx += key.w / 2
            key.cx = cx
            key.cy = cy
            cx += key.w / 2
            return key
        })

        return row
    }

    /// Special Keys:

    var shiftKey = {keyid: 'shift', keytext: '⇧', w: 0.15, h: 0.25,
        click: function() { switchLayout(1) },
        timeout: 99999,
        swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
        longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } }

    var unshiftKey = {keyid: 'unshift', keytext: '⇪', w: 0.15, h: 0.25,
        click: function() { switchLayout(0) },
        timeout: 99999,
        swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
        longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } }

    var backspaceKey = {keyid: 'bs', keytext: '⌫', w: 0.15, h: 0.25,
        click: Terminal.backspace,
        timeout: 200,
        swipe: {onEnter: nullfn, onMove: nullfn, onUp: Terminal.delGroupBefore},
        longpress: {onEnter: RepeatBackspaceAction.start, onMove: RepeatBackspaceAction.move, onUp: RepeatBackspaceAction.up } }

    var tosymKey = {keyid: 'tosym', keytext: '&123', w: 0.15, h: 0.25,
        click: function() { switchLayout(2) },
        timeout: 99999,
        swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
        longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } }

    var nextsymKey = {keyid: 'nextsym', keytext: '→', w: 0.15, h: 0.25,
        click: function() { switchLayout(3) },
        timeout: 99999,
        swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
        longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } }

    var cursorKey = {keyid: 'cursor', keytext: '✥', w:0.1, h: 0.25,
        click: Terminal.moveCursorLeft,
        timeout: 500 /*ms*/,
        swipe: {onEnter: CursorAction.start, onMove: CursorAction.move, onUp: CursorAction.up },
        longpress: {onEnter: RepeatCursorDownAction.start, onMove: RepeatCursorDownAction.move, onUp: RepeatCursorDownAction.up } }

    var ctrlKey = {keyid: 'ctrl', keytext: 'ctrl', w:0.1, h: 0.25, fontSize: '1.5rem',
        click: function() { switchLayout(4) },
        timeout: 400 /*ms*/,
        swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
        longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } }

    var altKey = {keyid: 'alt', keytext: 'alt', w:0.1, h: 0.25, fontSize: '1.5rem',
        click: function() { switchLayout(5) },
        timeout: 400 /*ms*/,
        swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
        longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } }

    var spacebarKey = {keyid: 'sp', keytext: ' ', w: 0.3, h: 0.25,
        click: Terminal.insert(' '),
        timeout: 200,
        swipe: {onEnter: nullfn, onMove: nullfn, onUp: Terminal.insertSoftTab},
        longpress: {onEnter: RepeatSpaceAction.start, onMove: RepeatSpaceAction.move, onUp: RepeatSpaceAction.up } }

    var newlineKey = {keyid: 'nl', keytext: '↩', w: 0.15, h: 0.25,
        click: function() {Terminal.newLine();},
        timeout: 200,
        swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
        longpress: {onEnter: RepeatNewlineAction.start, onMove: RepeatNewlineAction.move, onUp: RepeatNewlineAction.up } }

    var abcKey = {keyid: 'abc', keytext: 'abc', w: 0.15, h: 0.25,
        click: function() { switchLayout(0) },
        timeout: 99999,
        swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
        longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } }

    var escapeKey = {keyid: 'escape', keytext: 'esc', w:0.1, h: 0.25, fontSize: '1.5rem',
        click: Terminal.escape,
        timeout: 500 /*ms*/,
        swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
        longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } }

    var altsym1Key = {keyid: 'alt-sym1', keytext: 'alt', w:0.1, h: 0.25, fontSize: '1.5rem',
        click: function() { switchLayout(6) },
        timeout: 400 /*ms*/,
        swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
        longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } }

    var setfontsizeKey = {keyid: 'set-font-size', keytext: '🗚', w: 0.1, h: 0.25,
        click: function() { Terminal.configFontSize(); },
        timeout: 400 /*ms*/,
        swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
        longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } }

    var inputtextKey = {keyid: 'input-text', keytext: '🌐', w: 0.1, h: 0.25,
        click: function() {Terminal.inputNonEnglish();},
        timeout: 400 /*ms*/,
        swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
        longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } }

    var prevsymKey = {keyid: 'prevsym', keytext: '←', w: 0.15, h: 0.25,
        click: function() { switchLayout(2) },
        timeout: 99999,
        swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
        longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } }

    var delKey = {keyid: 'del', keytext: 'del', w:0.1, h: 0.25, fontSize: '1.5rem',
        click: Terminal.deleteKey,
        timeout: 400 /*ms*/,
        swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
        longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } }

    var altsym2Key = {keyid: 'alt-sym2', keytext: 'alt', w:0.1, h: 0.25, fontSize: '1.5rem',
        click: function() { switchLayout(7) },
        timeout: 400 /*ms*/,
        swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
        longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } }

    var unctrlKey = {keyid: 'unctrl', keytext: 'CTRL', w:0.1, h: 0.25, fontSize: '1.5rem',
        click: function() { switchLayout(0) },
        timeout: 400 /*ms*/,
        swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
        longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } }

    var unaltKey = {keyid: 'unalt', keytext: 'ALT', w:0.1, h: 0.25, fontSize: '1.5rem',
        click: function() { switchLayout(0) },
        timeout: 400 /*ms*/,
        swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
        longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } }

    var altnextsymKey = {keyid: 'alt-nextsym', keytext: '→', w: 0.15, h: 0.25,
        click: function() { switchLayout(7) },
        timeout: 99999,
        swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
        longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } }

    var altprevsymKey = {keyid: 'alt-prevsym', keytext: '←', w: 0.15, h: 0.25,
        click: function() { switchLayout(6) },
        timeout: 99999,
        swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
        longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } }

    var altprevsymKey = {keyid: 'alt-prevsym', keytext: '←', w: 0.15, h: 0.25,
        click: function() { switchLayout(6) },
        timeout: 99999,
        swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
        longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } }

    var pasteKey = {keyid: 'paste', keytext: '📋', w: 0.1, h: 0.25,
        click: function() {
            var clipboard = navigator.clipboard;
            if (clipboard == undefined) {
                console.log('clipboard is undefined');
                iziToast.show({
                    message: 'Clipboard not supported (Chrome & https/localhost only)',
                    position: 'topRight',
                })
            } else {
                clipboard.readText().then(function(text) {
                    Terminal.insertWord(text, true);
                })
            }

        },
        timeout: 99999,
        swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
        longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } }

    var copyKey = {keyid: 'copy', keytext: '✂️', w: 0.1, h: 0.25,
        click: function() {
            var w = window.open()
            w.document.write('<pre>' + term.serializeAddon.serialize() + '</pre>')
        },
        timeout: 99999,
        swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
        longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } }

    /////////

    var _currMode = 'bash'
    var _currLayout = 0
    var _layoutsConfig = {}
    _layoutsConfig['bash'] = [
        // layout 0
        _.flatten([
            makeKeyRow(0, 1/8, [
                makeRegularKey('q'),
                makeRegularKey('w'),
                makeRegularKey('e'),
                makeRegularKey('r'),
                makeRegularKey('t'),
                makeRegularKey('y'),
                makeRegularKey('u'),
                makeRegularKey('i'),
                makeRegularKey('o'),
                modifyKeyLongPress(makeRegularKey('p'), tmuxShortcutFn('p')),
            ]),
            makeKeyRow(0.05, 3/8, [
                makeRegularKey('a'),
                makeRegularKey('s'),
                makeRegularKey('d'),
                makeRegularKey('f'),
                makeRegularKey('g'),
                makeRegularKey('h'),
                makeRegularKey('j'),
                makeRegularKey('k'),
                makeRegularKey('l'),
            ]),
            makeKeyRow(0, 5/8, [
                shiftKey,
                makeRegularKey('z'),
                makeRegularKey('x'),
                makeRegularKey('c'),
                makeRegularKey('v'),
                makeRegularKey('b'),
                modifyKeyLongPress(makeRegularKey('n'), tmuxShortcutFn('n')),
                makeRegularKey('m'),
                backspaceKey,
            ]),
            makeKeyRow(0, 7/8, [
                tosymKey,
                cursorKey,
                ctrlKey,
                spacebarKey,
                makeRegularNonSwipableKey('-', 'dash'),
                makeRegularNonSwipableKey('.', 'dot'),
                newlineKey,
            ])

        ]),
        // layout 1 - SHIFT
        _.flatten([
            makeKeyRow(0, 1/8, [
                makeUppercaseKey('Q'),
                makeUppercaseKey('W'),
                makeUppercaseKey('E'),
                makeUppercaseKey('R'),
                makeUppercaseKey('T'),
                makeUppercaseKey('Y'),
                makeUppercaseKey('U'),
                makeUppercaseKey('I'),
                makeUppercaseKey('O'),
                makeUppercaseKey('P'),
            ]),
            makeKeyRow(0.05, 3/8, [
                makeUppercaseKey('A'),
                makeUppercaseKey('S'),
                makeUppercaseKey('D'),
                makeUppercaseKey('F'),
                makeUppercaseKey('G'),
                makeUppercaseKey('H'),
                makeUppercaseKey('J'),
                makeUppercaseKey('K'),
                makeUppercaseKey('L'),
            ]),
            makeKeyRow(0, 5/8, [
                unshiftKey,
                makeUppercaseKey('Z'),
                makeUppercaseKey('X'),
                makeUppercaseKey('C'),
                makeUppercaseKey('V'),
                makeUppercaseKey('B'),
                makeUppercaseKey('N'),
                makeUppercaseKey('M'),
                backspaceKey,
            ]),
            makeKeyRow(0, 7/8, [
                tosymKey,
                cursorKey,
                altKey,
                spacebarKey,
                makeRegularNonSwipableKey('-', 'dash'),
                makeRegularNonSwipableKey('.', 'dot'),
                newlineKey,
            ]),
        ]),
        // layout 2 - NUMBERS & SYMBOLS
        _.flatten([
            makeKeyRow(0, 1/8, [
                makeRegularNonSwipableKey('1', 'num1'),
                makeRegularNonSwipableKey('2', 'num2'),
                makeRegularNonSwipableKey('3', 'num3'),
                makeRegularNonSwipableKey('4', 'num4'),
                makeRegularNonSwipableKey('5', 'num5'),
                makeRegularNonSwipableKey('6', 'num6'),
                makeRegularNonSwipableKey('7', 'num7'),
                makeRegularNonSwipableKey('8', 'num8'),
                makeRegularNonSwipableKey('9', 'num9'),
                makeRegularNonSwipableKey('0', 'num0'),
            ]),
            makeKeyRow(0, 3/8, [
                makeRegularNonSwipableKey('^', 'caret'),
                makeRegularNonSwipableKey('$', 'dollar'),
                makeRegularNonSwipableKey('*', 'asterisk'),
                makeRegularNonSwipableKey('+', 'plus'),
                makeRegularNonSwipableKey('?', 'question'),
                makeRegularNonSwipableKey('~', 'tilde'),
                makeRegularNonSwipableKey('_', 'underscore'),
                makeRegularNonSwipableKey('&', 'ampersand'),
                makeRegularNonSwipableKey('@', 'at'),
                makeRegularNonSwipableKey(':', 'colon'),
            ]),
            makeKeyRow(0, 5/8, [
                nextsymKey,
                makeRegularNonSwipableKey('\'', 'quote'),
                makeRegularNonSwipableKey('"', 'doublequote'),
                makeRegularNonSwipableKey('<', 'langlebracket'),
                makeRegularNonSwipableKey('>', 'ranglebracket'),
                makeRegularNonSwipableKey('|', 'pipe'),
                makeRegularNonSwipableKey('`', 'backquote'),
                makeRegularNonSwipableKey(',', 'comma'),
                backspaceKey,
            ]),

            makeKeyRow(0, 7/8, [
                abcKey,
                escapeKey,
                altsym1Key,
                spacebarKey,
                makeRegularNonSwipableKey('=', 'equal'),
                makeRegularNonSwipableKey('/', 'slash'),
                newlineKey,
            ]),
        ]),
        // layout 3 - Other Symbols
        _.flatten([
            makeKeyRow(0, 1/8, [
                makeRegularNonSwipableKey('1', 'num1'),
                makeRegularNonSwipableKey('2', 'num2'),
                makeRegularNonSwipableKey('3', 'num3'),
                makeRegularNonSwipableKey('4', 'num4'),
                makeRegularNonSwipableKey('5', 'num5'),
                makeRegularNonSwipableKey('6', 'num6'),
                makeRegularNonSwipableKey('7', 'num7'),
                makeRegularNonSwipableKey('8', 'num8'),
                makeRegularNonSwipableKey('9', 'num9'),
                makeRegularNonSwipableKey('0', 'num0'),
            ]),
            makeKeyRow(0, 3/8, [
                makeRegularNonSwipableKey('%', 'percent'),
                makeRegularNonSwipableKey('!', 'exclaimation'),
                makeRegularNonSwipableKey('#', 'pound'),
                makeRegularNonSwipableKey('\\', 'backslash'),
                makeRegularNonSwipableKey(';', 'semicolon'),
                setfontsizeKey,
                copyKey,
                pasteKey,
                makeNothingKey(),
                makeNothingKey(),
            ]),
            makeKeyRow(0, 5/8, [
                prevsymKey,
                makeRegularNonSwipableKey('(', 'lparen'),
                makeRegularNonSwipableKey(')', 'rparen'),
                makeRegularNonSwipableKey('[', 'lbracket'),
                makeRegularNonSwipableKey(']', 'rbracket'),
                makeRegularNonSwipableKey('{', 'lbrace'),
                makeRegularNonSwipableKey('}', 'rbrace'),
                inputtextKey,
                backspaceKey,
            ]),
            makeKeyRow(0, 7/8, [
                abcKey,
                delKey,
                altsym2Key,
                spacebarKey,
                makeNothingKey(),
                makeNothingKey(),
                newlineKey,
            ]),
        ]),
        // layout 4 - Ctrl
        _.flatten([
            makeKeyRow(0, 1/8, [
                makeCtrlKey('q'),
                makeCtrlKey('w'),
                makeCtrlKey('e'),
                makeCtrlKey('r'),
                makeCtrlKey('t'),
                makeCtrlKey('y'),
                makeCtrlKey('u'),
                makeCtrlKey('i'),
                makeCtrlKey('o'),
                makeCtrlKey('p'),
            ]),
            makeKeyRow(0.05, 3/8, [
                makeCtrlKey('a'),
                makeCtrlKey('s'),
                makeCtrlKey('d'),
                makeCtrlKey('f'),
                makeCtrlKey('g'),
                makeCtrlKey('h'),
                makeCtrlKey('j'),
                makeCtrlKey('k'),
                makeCtrlKey('l'),
            ]),
            makeKeyRow(0, 5/8, [
                shiftKey,
                makeCtrlKey('z'),
                makeCtrlKey('x'),
                makeCtrlKey('c'),
                makeCtrlKey('v'),
                makeCtrlKey('b'),
                makeCtrlKey('n'),
                makeCtrlKey('m'),
                backspaceKey,
            ]),
            makeKeyRow(0, 7/8, [
                tosymKey,
                cursorKey,
                unctrlKey,
                spacebarKey,
                makeRegularNonSwipableKey('-', 'dash'),
                makeRegularNonSwipableKey('.', 'dot'),
                newlineKey,
            ]),
        ]),
        // layout 5 - ALT Letter
        _.flatten([
            makeKeyRow(0, 1/8, [
                makeAltKey('Q'),
                makeAltKey('W'),
                makeAltKey('E'),
                makeAltKey('R'),
                makeAltKey('T'),
                makeAltKey('Y'),
                makeAltKey('U'),
                makeAltKey('I'),
                makeAltKey('O'),
                makeAltKey('P'),
            ]),
            makeKeyRow(0.05, 3/8, [
                makeAltKey('A'),
                makeAltKey('S'),
                makeAltKey('D'),
                makeAltKey('F'),
                makeAltKey('G'),
                makeAltKey('H'),
                makeAltKey('J'),
                makeAltKey('K'),
                makeAltKey('L'),
            ]),
            makeKeyRow(0, 5/8, [
                shiftKey,
                makeAltKey('Z'),
                makeAltKey('X'),
                makeAltKey('C'),
                makeAltKey('V'),
                makeAltKey('B'),
                makeAltKey('N'),
                makeAltKey('M'),
                backspaceKey,
            ]),
            makeKeyRow(0, 7/8, [
                tosymKey,
                cursorKey,
                unaltKey,
                spacebarKey,
                makeAltKey('-', 'dash'),
                makeAltKey('.', 'dot'),
                newlineKey,
            ]),
        ]),
        // layout 6 - ALT + NUMBERS & SYMBOLS
        _.flatten([
            makeKeyRow(0, 1/8, [
                makeAltKey('1', 'num1'),
                makeAltKey('2', 'num2'),
                makeAltKey('3', 'num3'),
                makeAltKey('4', 'num4'),
                makeAltKey('5', 'num5'),
                makeAltKey('6', 'num6'),
                makeAltKey('7', 'num7'),
                makeAltKey('8', 'num8'),
                makeAltKey('9', 'num9'),
                makeAltKey('0', 'num0'),
            ]),
            makeKeyRow(0, 3/8, [
                makeAltKey('^', 'caret'),
                makeAltKey('$', 'dollar'),
                makeAltKey('*', 'asterisk'),
                makeAltKey('+', 'plus'),
                makeAltKey('?', 'question'),
                makeAltKey('~', 'tilde'),
                makeAltKey('_', 'underscore'),
                makeAltKey('&', 'ampersand'),
                makeAltKey('@', 'at'),
                makeAltKey(':', 'colon'),
            ]),
            makeKeyRow(0, 5/8, [
                altnextsymKey,
                makeAltKey('\'', 'quote'),
                makeAltKey('"', 'doublequote'),
                makeAltKey('<', 'langlebracket'),
                makeAltKey('>', 'ranglebracket'),
                makeAltKey('|', 'pipe'),
                makeAltKey('`', 'backquote'),
                makeAltKey(',', 'comma'),
                backspaceKey,
            ]),

            makeKeyRow(0, 7/8, [
                abcKey,
                escapeKey,
                unaltKey,
                spacebarKey,
                makeAltKey('=', 'equal'),
                makeAltKey('/', 'slash'),
                newlineKey,
            ]),
        ]),
        // layout 7 - ALT + Other Symbols
        _.flatten([
            makeKeyRow(0, 1/8, [
                makeAltKey('1', 'num1'),
                makeAltKey('2', 'num2'),
                makeAltKey('3', 'num3'),
                makeAltKey('4', 'num4'),
                makeAltKey('5', 'num5'),
                makeAltKey('6', 'num6'),
                makeAltKey('7', 'num7'),
                makeAltKey('8', 'num8'),
                makeAltKey('9', 'num9'),
                makeAltKey('0', 'num0'),
            ]),
            makeKeyRow(0, 3/8, [
                makeAltKey('%', 'percent'),
                makeAltKey('!', 'exclaimation'),
                makeAltKey('#', 'pound'),
                makeAltKey('\\', 'backslash'),
                makeAltKey(';', 'semicolon'),
                setfontsizeKey,
                makeNothingKey(),
                makeNothingKey(),
                makeNothingKey(),
                makeNothingKey(),
            ]),
            makeKeyRow(0, 5/8, [
                altprevsymKey,
                makeAltKey('(', 'lparen'),
                makeAltKey(')', 'rparen'),
                makeAltKey('[', 'lbracket'),
                makeAltKey(']', 'rbracket'),
                makeAltKey('{', 'lbrace'),
                makeAltKey('}', 'rbrace'),
                inputtextKey,
                backspaceKey,
            ]),
            makeKeyRow(0, 7/8, [
                abcKey,
                delKey,
                unaltKey,
                spacebarKey,
                makeNothingKey(),
                makeNothingKey(),
                newlineKey,
            ]),
        ]),
    ]
    _layoutsConfig['vim'] = [
        // layout 0
        _.flatten([
            makeKeyRow(0, 1/8, [
                makeRegularKey('q'),
                makeRegularKey('w'),
                makeRegularKey('e'),
                makeRegularKey('r'),
                makeRegularKey('t'),
                makeRegularKey('y'),
                makeRegularKey('u'),
                makeRegularKey('i'),
                makeRegularKey('o'),
                modifyKeyLongPress(makeRegularKey('p'), tmuxShortcutFn('p')),
            ]),
            makeKeyRow(0.05, 3/8, [
                makeRegularKey('a'),
                makeRegularKey('s'),
                makeRegularKey('d'),
                makeRegularKey('f'),
                makeRegularKey('g'),
                makeRegularKey('h'),
                makeRegularKey('j'),
                makeRegularKey('k'),
                makeRegularKey('l'),
            ]),
            makeKeyRow(0, 5/8, [
                shiftKey,
                makeRegularKey('z'),
                makeRegularKey('x'),
                makeRegularKey('c'),
                makeRegularKey('v'),
                makeRegularKey('b'),
                modifyKeyLongPress(makeRegularKey('n'), tmuxShortcutFn('n')),
                makeRegularKey('m'),
                backspaceKey,
            ]),
            makeKeyRow(0, 7/8, [
                tosymKey,
                cursorKey,
                ctrlKey,
                spacebarKey,
                makeRegularNonSwipableKey(',', 'comma'),
                makeRegularNonSwipableKey('.', 'dot'),
                newlineKey,
            ])

        ]),
        // layout 1 - SHIFT
        _.flatten([
            makeKeyRow(0, 1/8, [
                makeUppercaseKey('Q'),
                makeUppercaseKey('W'),
                makeUppercaseKey('E'),
                makeUppercaseKey('R'),
                makeUppercaseKey('T'),
                makeUppercaseKey('Y'),
                makeUppercaseKey('U'),
                makeUppercaseKey('I'),
                makeUppercaseKey('O'),
                makeUppercaseKey('P'),
            ]),
            makeKeyRow(0.05, 3/8, [
                makeUppercaseKey('A'),
                makeUppercaseKey('S'),
                makeUppercaseKey('D'),
                makeUppercaseKey('F'),
                makeUppercaseKey('G'),
                makeUppercaseKey('H'),
                makeUppercaseKey('J'),
                makeUppercaseKey('K'),
                makeUppercaseKey('L'),
            ]),
            makeKeyRow(0, 5/8, [
                unshiftKey,
                makeUppercaseKey('Z'),
                makeUppercaseKey('X'),
                makeUppercaseKey('C'),
                makeUppercaseKey('V'),
                makeUppercaseKey('B'),
                makeUppercaseKey('N'),
                makeUppercaseKey('M'),
                backspaceKey,
            ]),
            makeKeyRow(0, 7/8, [
                tosymKey,
                cursorKey,
                altKey,
                spacebarKey,
                makeRegularNonSwipableKey('-', 'dash'),
                makeRegularNonSwipableKey('.', 'dot'),
                newlineKey,
            ]),
        ]),
        // layout 2 - NUMBERS & SYMBOLS
        _.flatten([
            makeKeyRow(0, 1/8, [
                makeRegularNonSwipableKey('1', 'num1'),
                makeRegularNonSwipableKey('2', 'num2'),
                makeRegularNonSwipableKey('3', 'num3'),
                makeRegularNonSwipableKey('4', 'num4'),
                makeRegularNonSwipableKey('5', 'num5'),
                makeRegularNonSwipableKey('6', 'num6'),
                makeRegularNonSwipableKey('7', 'num7'),
                makeRegularNonSwipableKey('8', 'num8'),
                makeRegularNonSwipableKey('9', 'num9'),
                makeRegularNonSwipableKey('0', 'num0'),
            ]),
            makeKeyRow(0, 3/8, [
                makeRegularNonSwipableKey('^', 'caret'),
                makeRegularNonSwipableKey('$', 'dollar'),
                makeRegularNonSwipableKey('*', 'asterisk'),
                makeRegularNonSwipableKey('+', 'plus'),
                makeRegularNonSwipableKey('?', 'question'),
                makeRegularNonSwipableKey('~', 'tilde'),
                makeRegularNonSwipableKey('_', 'underscore'),
                makeRegularNonSwipableKey('&', 'ampersand'),
                makeRegularNonSwipableKey('@', 'at'),
                makeRegularNonSwipableKey(':', 'colon'),
            ]),
            makeKeyRow(0, 5/8, [
                nextsymKey,
                makeRegularNonSwipableKey('\'', 'quote'),
                makeRegularNonSwipableKey('"', 'doublequote'),
                makeRegularNonSwipableKey('<', 'langlebracket'),
                makeRegularNonSwipableKey('>', 'ranglebracket'),
                makeRegularNonSwipableKey('|', 'pipe'),
                makeRegularNonSwipableKey('`', 'backquote'),
                makeRegularNonSwipableKey(',', 'comma'),
                backspaceKey,
            ]),

            makeKeyRow(0, 7/8, [
                abcKey,
                escapeKey,
                altsym1Key,
                spacebarKey,
                makeRegularNonSwipableKey('=', 'equal'),
                makeRegularNonSwipableKey('/', 'slash'),
                newlineKey,
            ]),
        ]),
        // layout 3 - Other Symbols
        _.flatten([
            makeKeyRow(0, 1/8, [
                makeRegularNonSwipableKey('1', 'num1'),
                makeRegularNonSwipableKey('2', 'num2'),
                makeRegularNonSwipableKey('3', 'num3'),
                makeRegularNonSwipableKey('4', 'num4'),
                makeRegularNonSwipableKey('5', 'num5'),
                makeRegularNonSwipableKey('6', 'num6'),
                makeRegularNonSwipableKey('7', 'num7'),
                makeRegularNonSwipableKey('8', 'num8'),
                makeRegularNonSwipableKey('9', 'num9'),
                makeRegularNonSwipableKey('0', 'num0'),
            ]),
            makeKeyRow(0, 3/8, [
                makeRegularNonSwipableKey('%', 'percent'),
                makeRegularNonSwipableKey('!', 'exclaimation'),
                makeRegularNonSwipableKey('#', 'pound'),
                makeRegularNonSwipableKey('\\', 'backslash'),
                makeRegularNonSwipableKey(';', 'semicolon'),
                setfontsizeKey,
                pasteKey,
                makeNothingKey(),
                makeNothingKey(),
                makeNothingKey(),
            ]),
            makeKeyRow(0, 5/8, [
                prevsymKey,
                makeRegularNonSwipableKey('(', 'lparen'),
                makeRegularNonSwipableKey(')', 'rparen'),
                makeRegularNonSwipableKey('[', 'lbracket'),
                makeRegularNonSwipableKey(']', 'rbracket'),
                makeRegularNonSwipableKey('{', 'lbrace'),
                makeRegularNonSwipableKey('}', 'rbrace'),
                inputtextKey,
                backspaceKey,
            ]),
            makeKeyRow(0, 7/8, [
                abcKey,
                delKey,
                altsym2Key,
                spacebarKey,
                makeNothingKey(),
                makeNothingKey(),
                newlineKey,
            ]),
        ]),
        // layout 4 - Ctrl
        _.flatten([
            makeKeyRow(0, 1/8, [
                makeCtrlKey('q'),
                makeCtrlKey('w'),
                makeCtrlKey('e'),
                makeCtrlKey('r'),
                makeCtrlKey('t'),
                makeCtrlKey('y'),
                makeCtrlKey('u'),
                makeCtrlKey('i'),
                makeCtrlKey('o'),
                makeCtrlKey('p'),
            ]),
            makeKeyRow(0.05, 3/8, [
                makeCtrlKey('a'),
                makeCtrlKey('s'),
                makeCtrlKey('d'),
                makeCtrlKey('f'),
                makeCtrlKey('g'),
                makeCtrlKey('h'),
                makeCtrlKey('j'),
                makeCtrlKey('k'),
                makeCtrlKey('l'),
            ]),
            makeKeyRow(0, 5/8, [
                shiftKey,
                makeCtrlKey('z'),
                makeCtrlKey('x'),
                makeCtrlKey('c'),
                makeCtrlKey('v'),
                makeCtrlKey('b'),
                makeCtrlKey('n'),
                makeCtrlKey('m'),
                backspaceKey,
            ]),
            makeKeyRow(0, 7/8, [
                tosymKey,
                cursorKey,
                unctrlKey,
                spacebarKey,
                makeRegularNonSwipableKey('-', 'dash'),
                makeRegularNonSwipableKey('.', 'dot'),
                newlineKey,
            ]),
        ]),
        // layout 5 - ALT Letter
        _.flatten([
            makeKeyRow(0, 1/8, [
                makeAltKey('Q'),
                makeAltKey('W'),
                makeAltKey('E'),
                makeAltKey('R'),
                makeAltKey('T'),
                makeAltKey('Y'),
                makeAltKey('U'),
                makeAltKey('I'),
                makeAltKey('O'),
                makeAltKey('P'),
            ]),
            makeKeyRow(0.05, 3/8, [
                makeAltKey('A'),
                makeAltKey('S'),
                makeAltKey('D'),
                makeAltKey('F'),
                makeAltKey('G'),
                makeAltKey('H'),
                makeAltKey('J'),
                makeAltKey('K'),
                makeAltKey('L'),
            ]),
            makeKeyRow(0, 5/8, [
                shiftKey,
                makeAltKey('Z'),
                makeAltKey('X'),
                makeAltKey('C'),
                makeAltKey('V'),
                makeAltKey('B'),
                makeAltKey('N'),
                makeAltKey('M'),
                backspaceKey,
            ]),
            makeKeyRow(0, 7/8, [
                tosymKey,
                cursorKey,
                unaltKey,
                spacebarKey,
                makeAltKey('-', 'dash'),
                makeAltKey('.', 'dot'),
                newlineKey,
            ]),
        ]),
        // layout 6 - ALT + NUMBERS & SYMBOLS
        _.flatten([
            makeKeyRow(0, 1/8, [
                makeAltKey('1', 'num1'),
                makeAltKey('2', 'num2'),
                makeAltKey('3', 'num3'),
                makeAltKey('4', 'num4'),
                makeAltKey('5', 'num5'),
                makeAltKey('6', 'num6'),
                makeAltKey('7', 'num7'),
                makeAltKey('8', 'num8'),
                makeAltKey('9', 'num9'),
                makeAltKey('0', 'num0'),
            ]),
            makeKeyRow(0, 3/8, [
                makeAltKey('^', 'caret'),
                makeAltKey('$', 'dollar'),
                makeAltKey('*', 'asterisk'),
                makeAltKey('+', 'plus'),
                makeAltKey('?', 'question'),
                makeAltKey('~', 'tilde'),
                makeAltKey('_', 'underscore'),
                makeAltKey('&', 'ampersand'),
                makeAltKey('@', 'at'),
                makeAltKey(':', 'colon'),
            ]),
            makeKeyRow(0, 5/8, [
                altnextsymKey,
                makeAltKey('\'', 'quote'),
                makeAltKey('"', 'doublequote'),
                makeAltKey('<', 'langlebracket'),
                makeAltKey('>', 'ranglebracket'),
                makeAltKey('|', 'pipe'),
                makeAltKey('`', 'backquote'),
                makeAltKey(',', 'comma'),
                backspaceKey,
            ]),

            makeKeyRow(0, 7/8, [
                abcKey,
                escapeKey,
                unaltKey,
                spacebarKey,
                makeAltKey('=', 'equal'),
                makeAltKey('/', 'slash'),
                newlineKey,
            ]),
        ]),
        // layout 7 - ALT + Other Symbols
        _.flatten([
            makeKeyRow(0, 1/8, [
                makeAltKey('1', 'num1'),
                makeAltKey('2', 'num2'),
                makeAltKey('3', 'num3'),
                makeAltKey('4', 'num4'),
                makeAltKey('5', 'num5'),
                makeAltKey('6', 'num6'),
                makeAltKey('7', 'num7'),
                makeAltKey('8', 'num8'),
                makeAltKey('9', 'num9'),
                makeAltKey('0', 'num0'),
            ]),
            makeKeyRow(0, 3/8, [
                makeAltKey('%', 'percent'),
                makeAltKey('!', 'exclaimation'),
                makeAltKey('#', 'pound'),
                makeAltKey('\\', 'backslash'),
                makeAltKey(';', 'semicolon'),
                setfontsizeKey,
                makeNothingKey(),
                makeNothingKey(),
                makeNothingKey(),
                makeNothingKey(),
            ]),
            makeKeyRow(0, 5/8, [
                altprevsymKey,
                makeAltKey('(', 'lparen'),
                makeAltKey(')', 'rparen'),
                makeAltKey('[', 'lbracket'),
                makeAltKey(']', 'rbracket'),
                makeAltKey('{', 'lbrace'),
                makeAltKey('}', 'rbrace'),
                inputtextKey,
                backspaceKey,
            ]),
            makeKeyRow(0, 7/8, [
                abcKey,
                delKey,
                unaltKey,
                spacebarKey,
                makeNothingKey(),
                makeNothingKey(),
                newlineKey,
            ]),
        ]),
    ]
    var _layoutsSVG = {} //*svg group* for each layout
    Object.keys(_layoutsConfig).forEach(function(mode) { _layoutsSVG[mode] = [] })
    var _width = 600 //of svg doc
    var _height = 240 //of svg doc
    var _keyboardSVG //the outermost svg doc
    var _canvas
    var _ctx
    var _div //the div to hold the SVG
    // var _div //the div to hold the keyboard canvas
    var _kbdctx
    var _dpr = window.devicePixelRatio //for proper scaling of text

    var drawPath = function(path, color) {
        _ctx.lineWidth = 10
        for (var i = 1; i < path.length; i++) {
            _ctx.beginPath()
            // _ctx.lineJoin = 'round'
            // _ctx.lineCap  = 'round'
            _ctx.strokeStyle = color
            var oldCtxLineWidth = _ctx.lineWidth
            _ctx.lineWidth = 4
            _ctx.moveTo(path[i-1].x * _canvas.width , path[i-1].y * _canvas.height)
            _ctx.lineTo(path[i].x * _canvas.width, path[i].y * _canvas.height)
            _ctx.stroke()
            _ctx.lineWidth = oldCtxLineWidth
            _ctx.closePath()
        }
    }
    window.drawPath = drawPath
    window.clearPath = function() {
        _ctx.clearRect(0,0,_canvas.width, _canvas.height)
    }

    var isPtWithinKey = function (pt, key) {
        return pt.x >= key.cx-key.w/2
            && pt.x <= key.cx+key.w/2
            && pt.y >= key.cy-key.h/2
            && pt.y <= key.cy+key.h/2
    }

    var getKeyUnderPoint = function (pt) {
        for(var i = 0; i < _layoutsConfig[_currMode][_currLayout].length; i++) {
            var key = _layoutsConfig[_currMode][_currLayout][i]
            if(isPtWithinKey(pt, key)) {
                return key
            }
        }
        return null
    }

    var initLayout = function(ith) {
        console.log("initLayout", ith)
        var kbdw = _width
        var kbdh = _height
        var layout = _keyboardSVG.group()
        layout.attr('id','layout-'+String(ith))
        _layoutsSVG[_currMode][ith] = layout

        for(var i = 0; i < _layoutsConfig[_currMode][ith].length; i++) {
            var key = _layoutsConfig[_currMode][ith][i]
            var keyrect = layout
                            .rect(kbdw*key.w, kbdh*key.h)
                            .fill({ color: '#f0f0f0' })
                            .stroke({width: 2, color: '#ffffff'})
                            .center(key.cx*kbdw, key.cy*kbdh)

            var fontSize = key.fontSize || '2rem'

            var keytext = layout
                            .text(key.keytext)
                            .font({ size: fontSize, family: 'Helvetica' })
                            .center(key.cx*kbdw, key.cy*kbdh)

            var keygroup = layout.group().add(keyrect).add(keytext)
            keygroup.attr('id',key.keyid+'-key')
        }

        layout.hide() //initially all layouts are hidden
    }

    var switchLayout = function(num) {
        if(_layoutsSVG[_currMode][_currLayout]) {
            _layoutsSVG[_currMode][_currLayout].hide()
        }

        if(!_layoutsSVG[_currMode][num]) {
            initLayout(num)
        }

        _layoutsSVG[_currMode][num].show()
        _currLayout = num
    }

    var switchMode = function(mode) {
        if(!mode in _layoutsSVG) return
        if(_layoutsSVG[_currMode][_currLayout]) {
            _layoutsSVG[_currMode][_currLayout].hide()
        }

        _currMode = mode
        var num = 0
        if(!_layoutsSVG[_currMode][num]) {
            initLayout(num)
        }

        _layoutsSVG[_currMode][num].show()
        _currLayout = num
    }

    var isUpperCase = function() {
        return _currLayout === 1
    }

    // The event object
    var Events = (function() {
        // State Machine Constants
        var NOT_PRESSED = 0
        var INITIAL_STATE = 1
        var SWIPE_STATE = 2
        var LONGPRESS_STATE = 3

        // State Machine States
        var state = NOT_PRESSED
        var ptrId = null //to prevent glitches in multitouch
        var timeoutEvent = null
        var highlighKey = null
        var downState = {
            // pt: {x, y}
            // key
        }
        var currHighlight = null

        var timeoutCallback = function() {
            // state transition
            state = LONGPRESS_STATE
            downState.key.longpress.onEnter()
            // console.log("time out")
        }


        var pointerDownEvent = function (evt) {
            evt.stopPropagation()
            if(state !== NOT_PRESSED) {
                console.log(state,ptrId,timeoutEvent,highlighKey,downState,currHighlight)
                return
            }

            var offsetY = evt.pageY - evt.currentTarget.offsetParent.offsetTop
            var offsetX = evt.pageX - evt.currentTarget.offsetParent.offsetLeft

            //record the initial key and position
            downState.pt = {x:offsetX/_canvas.width, y:offsetY/_canvas.height}
            downState.key = getKeyUnderPoint(downState.pt)
            if(!downState.key) {
                //clicking blank area with no keys
                return
            }

            // state transition
            state = INITIAL_STATE

            ptrId = evt.pointerId

            // highlight the key
            currHighlight = _layoutsSVG[_currMode][_currLayout].node.querySelector('#'+downState.key.keyid+'-key rect')

            currHighlight.style.fill = '#cccccc'

            // for transitioning to Long press State
            timeoutEvent = window.setTimeout(timeoutCallback, downState.key.timeout)
        }

        var pointerMoveEvent = function (evt) {
            evt.stopPropagation()
            if((state === NOT_PRESSED) || (evt.pointerId !== ptrId)) return

            var offsetY = evt.pageY - evt.currentTarget.offsetParent.offsetTop
            var offsetX = evt.pageX - evt.currentTarget.offsetParent.offsetLeft
            var currPt = {x: offsetX/_canvas.width, y:offsetY/_canvas.height}

            if(state === INITIAL_STATE) {
                // INITIAL STATE mouse move out of downState key
                if(!isPtWithinKey(currPt, downState.key)) {
                    window.clearTimeout(timeoutEvent)
                    currHighlight.style.fill = '#f0f0f0'  //dehighlight

                    state = SWIPE_STATE
                    downState.key.swipe.onEnter(downState, currPt)
                }
            } else if (state === SWIPE_STATE) {
                downState.key.swipe.onMove(currPt)
            } else if (state === LONGPRESS_STATE) {
                downState.key.longpress.onMove(currPt)
            } else {
                console.log("impossible state WTF")
            }

        }

        var pointerUpEvent = function (evt) {
            evt.stopPropagation()
            if((state === NOT_PRESSED) || (evt.pointerId !== ptrId)) return
            var offsetY = evt.pageY - evt.currentTarget.offsetParent.offsetTop
            var offsetX = evt.pageX - evt.currentTarget.offsetParent.offsetLeft
            var currPt = {x: offsetX/_canvas.width, y:offsetY/_canvas.height}

            if(state === INITIAL_STATE) {
                downState.key.click()
            } else if (state === SWIPE_STATE) {
                downState.key.swipe.onUp(currPt)
            } else if (state === LONGPRESS_STATE) {
                downState.key.longpress.onUp(currPt)
            }

            // Clean ups
            ptrId = null
            currHighlight.style.fill = '#f0f0f0'  //dehighlight
            currHighlight = null
            state = NOT_PRESSED
            _ctx.clearRect(0, 0, _canvas.width, _canvas.height)
            if(timeoutEvent) {
                window.clearTimeout(timeoutEvent)
            }

            // This prevent iOS from scrolling into blank space below the #app elem
            evt.preventDefault();
        }

        var initialize = function() {
            _canvas.addEventListener('pointerdown', pointerDownEvent)
            _canvas.addEventListener('pointermove', pointerMoveEvent)
            _canvas.addEventListener('pointerup',   pointerUpEvent)
            _canvas.addEventListener('pointerout',  pointerUpEvent) //proper clean up
        }

        return {
            initialize: initialize
        }
    })()


    var resizeEvent = function(e) {
            _canvas.width           = container.clientWidth
            _canvas.height          = container.clientHeight

            //for dolphin browser
            if(_keyboardSVG.node.clientHeight === 0){
                _keyboardSVG.node.style.height = container.clientHeight+'px'
            }
    }

    var initialize = function(container) {
        _div = container.querySelector('div')
        _keyboardSVG = SVG(_div).attr('viewBox', '0 0 ' + String(_width) + ' ' + String(_height))

        // to prevent the unnecessary scrollbar appearing on IE
        // whenever there are <text> with center greater than
        // some weird threshold
        // see http://stackoverflow.com/questions/16093240/ie10-on-windows-7-svg-scrolling-too-far-when-inside-a-div
        _keyboardSVG.style('overflow:hidden')

        _canvas = container.querySelector('canvas')
        _ctx = _canvas.getContext('2d')
        // set the width height correctly after DOM ready
        $(function() {
            resizeEvent()
            switchLayout(0)
        })

        Events.initialize()
    }

    return {
        initialize: initialize,
        resize: resizeEvent,
        isUpperCase: isUpperCase,
        switchMode: switchMode,
    }
})(Terminal, Analyzer)
Keyboard.initialize(document.getElementById('container'))

