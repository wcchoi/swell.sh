var nullfn = function () {
    console.log("called nullfn")
    return null;
}

function isNullOrUndefined(x) {
    return _.isUndefined(x) || _.isNull(x);
}

var updateCompleter = function(suggestions, prefix, reupdateCompleter, addSpaceAtEnd) {
    if(!prefix) prefix = ''
    if(isNullOrUndefined(reupdateCompleter)) reupdateCompleter = false
    if(isNullOrUndefined(addSpaceAtEnd)) addSpaceAtEnd = false

    var c = document.getElementById('completer')

    var s = ["<ul class='candidates'>"]

    suggestions.forEach(function (sugg) {
        s.push("<li class='suggestion' data-value='"+ sugg  +"'><strong>" + sugg  + "</strong></li>")
    })

    s.push("</ul>")

    requestAnimationFrame(function(){
        c.innerHTML = ''
        c.innerHTML = s.join('')
        c.scrollLeft = 0
        var lastInput = ''
        $('.suggestion').on('click', function (evt) {
            var word = evt.currentTarget.dataset.value
            if(lastInput) {
                Terminal.backspaceNTimes(lastInput.length)
            }
            lastInput = word.slice(prefix.length, word.length)
            if(addSpaceAtEnd) {
                lastInput += ' ' // input an extra space at the end
            }
            Terminal.insertWord(lastInput, reupdateCompleter)
        })
    })
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
            } else {
                if(msg.err) {
                    promiseReject(msg.err)
                } else {
                    promiseResolve(msg.data)
                }
            }
        }
        window.worker = worker
    }

    //make Web Worker promise
    var makeWWPromise = function(msg) {
        var promise = new Promise(function (resolve, reject) {
            worker.postMessage(msg)
            promiseResolve = resolve
            promiseReject = reject
        })
        return promise
    }

    var getSuggestions = function(inputpath, completions, mode) {
        return makeWWPromise({fn: "getSuggestions", args: [inputpath, completions, mode]})
    }

    var getCompletions= function() {
        return makeWWPromise({fn: "getCompletions", args: []})
    }

    var getCompletionsAtLoc = function() {
        return makeWWPromise({fn: "getCompletionsAtLoc", args: []})
    }

    return {
        initialize: initialize,
        getSuggestions: getSuggestions,
        getCompletionsAtLoc: getCompletionsAtLoc,
        getCompletions: getCompletions,
    }
})()
Analyzer.initialize()

var autocompletefn = _.debounce(function() {
    Analyzer.getCompletionsAtLoc()
        .then(function(data) {
            if(data.completions && data.completions.length > 0) {
                updateCompleter(data.completions.slice(0,10), data.prefix, data.reupdateCompleter, data.addSpaceAtEnd)
            } else {
                updateCompleter([]) //clear it
            }
        }).catch(function(err){
            console.log('autocompletefn err:', err)
            showErrorCompleter("Can't fetch from server, please try again...");
        })
}, 300)

var Terminal = (function(term) {
    var delGroupBefore = function() {
        term._core.handler('\x17') // CTRL-W
        autocompletefn()
    }
    var insertWord = function(word, shouldUpdateCompleter) {
        if(typeof shouldUpdateCompleter === 'undefined') shouldUpdateCompleter = true
        for(var i = 0; i < word.length; i++) {
            var c = word[i]
            term._core.handler(c[0]);
        }
        if(shouldUpdateCompleter) {
            autocompletefn()
        }
    }
    var insert = function(c) {
        return function(){
            term._core.handler(c[0]);
            autocompletefn()
        }
    }
    var insertSp = function(which, shouldUpdateCompleter) {
        return function(){
            if(typeof shouldUpdateCompleter === 'undefined') shouldUpdateCompleter = true
            term._core.handler(String.fromCharCode(which));

            if(shouldUpdateCompleter) {
                autocompletefn()
            }
        }
    }
    var insertSp2 = function(which) {
        return function(){
            term._core.handler(String.fromCharCode(0x1b) + which);

            autocompletefn()
        }
    }
    var insertCtrl = function(c) {
        return function(){
            term._core.handler(String.fromCharCode(c.charCodeAt(0) - 64))
            autocompletefn()
        }
    }
    var insertAlt = function(c) {
        return function(){
            term._core.handler(String.fromCharCode(0x1b) + c[0].toLowerCase())
            autocompletefn()
        }
    }
    var setFontSize = function(size) {
        var termContainer = term.element.parentElement
        var origHeight = termContainer.offsetHeight;
        termContainer.style.height = origHeight + "px";
        term.setOption("fontSize", size)
        term.fit();
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
                    term._core.handler(text);
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
            Analyzer.getCompletions()
            .then(function(data) {
                return Analyzer.getSuggestions(inputpath, data.completions, 'bash')
            }).then(function(completions){
                // console.log(completions)
                var compl = _.pluck(completions, 'word')
                if(compl.length > 0) {
                    updateCompleter(compl)

                    // input the first suggestion
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

    var _currLayout = 0
    var _layoutsConfig = [
        // layout 0
        [
            {keyid: 'q', keytext: 'q', cx: 0.05, cy: 1/8, w: 0.1, h: 0.25,
                click: Terminal.insert('q'),
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'w', keytext: 'w', cx: 0.15, cy: 1/8, w: 0.1, h: 0.25,
                click: Terminal.insert('w'),
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'e', keytext: 'e', cx: 0.25, cy: 1/8, w: 0.1, h: 0.25,
                click: Terminal.insert('e'),
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'r', keytext: 'r', cx: 0.35, cy: 1/8, w: 0.1, h: 0.25,
                click: Terminal.insert('r'),
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 't', keytext: 't', cx: 0.45, cy: 1/8, w: 0.1, h: 0.25,
                click: Terminal.insert('t'),
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'y', keytext: 'y', cx: 0.55, cy: 1/8, w: 0.1, h: 0.25,
                click: Terminal.insert('y'),
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'u', keytext: 'u', cx: 0.65, cy: 1/8, w: 0.1, h: 0.25,
                click: Terminal.insert('u'),
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'i', keytext: 'i', cx: 0.75, cy: 1/8, w: 0.1, h: 0.25,
                click: Terminal.insert('i'),
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'o', keytext: 'o', cx: 0.85, cy: 1/8, w: 0.1, h: 0.25,
                click: Terminal.insert('o'),
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'p', keytext: 'p', cx: 0.95, cy: 1/8, w: 0.1, h: 0.25,
                click: Terminal.insert('p'),
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'a', keytext: 'a', cx: 0.1, cy: 3/8, w: 0.1, h: 0.25,
                click: Terminal.insert('a'),
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 's', keytext: 's', cx: 0.2, cy: 3/8, w: 0.1, h: 0.25,
                click: Terminal.insert('s'),
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'd', keytext: 'd', cx: 0.3, cy: 3/8, w: 0.1, h: 0.25,
                click: Terminal.insert('d'),
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'f', keytext: 'f', cx: 0.4, cy: 3/8, w: 0.1, h: 0.25,
                click: Terminal.insert('f'),
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'g', keytext: 'g', cx: 0.5, cy: 3/8, w: 0.1, h: 0.25,
                click: Terminal.insert('g'),
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'h', keytext: 'h', cx: 0.6, cy: 3/8, w: 0.1, h: 0.25,
                click: Terminal.insert('h'),
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'j', keytext: 'j', cx: 0.7, cy: 3/8, w: 0.1, h: 0.25,
                click: Terminal.insert('j'),
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'k', keytext: 'k', cx: 0.8, cy: 3/8, w: 0.1, h: 0.25,
                click: Terminal.insert('k'),
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'l', keytext: 'l', cx: 0.9, cy: 3/8, w: 0.1, h: 0.25,
                click: Terminal.insert('l'),
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'z', keytext: 'z', cx: 0.2, cy: 5/8, w: 0.1, h: 0.25,
                click: Terminal.insert('z'),
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'x', keytext: 'x', cx: 0.3, cy: 5/8, w: 0.1, h: 0.25,
                click: Terminal.insert('x'),
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'c', keytext: 'c', cx: 0.4, cy: 5/8, w: 0.1, h: 0.25,
                click: Terminal.insert('c'),
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'v', keytext: 'v', cx: 0.5, cy: 5/8, w: 0.1, h: 0.25,
                click: Terminal.insert('v'),
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'b', keytext: 'b', cx: 0.6, cy: 5/8, w: 0.1, h: 0.25,
                click: Terminal.insert('b'),
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'n', keytext: 'n', cx: 0.7, cy: 5/8, w: 0.1, h: 0.25,
                click: Terminal.insert('n'),
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'm', keytext: 'm', cx: 0.8, cy: 5/8, w: 0.1, h: 0.25,
                click: Terminal.insert('m'),
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'shift', keytext: '⇧', cx: 0.075, cy: 5/8, w: 0.15, h: 0.25,
                click: function() { switchLayout(1) },
                timeout: 99999,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'bs', keytext: '⌫', cx: 0.925, cy: 5/8, w: 0.15, h: 0.25,
                click: Terminal.backspace,
                timeout: 200,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: Terminal.delGroupBefore},
                longpress: {onEnter: RepeatBackspaceAction.start, onMove: RepeatBackspaceAction.move, onUp: RepeatBackspaceAction.up } },
            {keyid: 'tosym', keytext: '&123', cx: 0.075, cy: 7/8, w: 0.15, h: 0.25,
                click: function() { switchLayout(2) },
                timeout: 99999,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'nl', keytext: '↩', cx: 0.925, cy: 7/8, w: 0.15, h: 0.25,
                click: Terminal.newLine,
                timeout: 200,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
                longpress: {onEnter: RepeatNewlineAction.start, onMove: RepeatNewlineAction.move, onUp: RepeatNewlineAction.up } },
            {keyid: 'sp', keytext: ' ', cx: 0.5, cy: 7/8, w: 0.3, h: 0.25,
                click: Terminal.insert(' '),
                timeout: 200,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: Terminal.insertSoftTab},
                longpress: {onEnter: RepeatSpaceAction.start, onMove: RepeatSpaceAction.move, onUp: RepeatSpaceAction.up } },
            {keyid: 'dot', keytext: '.', cx: 0.8, cy: 7/8, w:0.1, h: 0.25,
                click: function() {Terminal.insert('.')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'dash', keytext: '-', cx: 0.7, cy: 7/8, w:0.1, h: 0.25,
                click: function() {Terminal.insert('-')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'cursor', keytext: '✥', cx: 0.2, cy: 7/8, w:0.1, h: 0.25,
                click: Terminal.moveCursorLeft,
                timeout: 500 /*ms*/,
                swipe: {onEnter: CursorAction.start, onMove: CursorAction.move, onUp: CursorAction.up },
                longpress: {onEnter: RepeatCursorDownAction.start, onMove: RepeatCursorDownAction.move, onUp: RepeatCursorDownAction.up } },
            {keyid: 'ctrl', keytext: 'ctrl', cx: 0.3, cy: 7/8, w:0.1, h: 0.25, fontSize: '1.5rem',
                click: function() { switchLayout(4) },
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } }
        ],
        // layout 1 - SHIFT
        [
            {keyid: 'Q', keytext: 'Q', cx: 0.05, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('Q')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'W', keytext: 'W', cx: 0.15, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('W')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'E', keytext: 'E', cx: 0.25, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('E')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'R', keytext: 'R', cx: 0.35, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('R')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'T', keytext: 'T', cx: 0.45, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('T')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'Y', keytext: 'Y', cx: 0.55, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('Y')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'U', keytext: 'U', cx: 0.65, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('U')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'I', keytext: 'I', cx: 0.75, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('I')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'O', keytext: 'O', cx: 0.85, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('O')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'P', keytext: 'P', cx: 0.95, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('P')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'A', keytext: 'A', cx: 0.1, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('A')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'S', keytext: 'S', cx: 0.2, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('S')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'D', keytext: 'D', cx: 0.3, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('D')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'F', keytext: 'F', cx: 0.4, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('F')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'G', keytext: 'G', cx: 0.5, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('G')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'H', keytext: 'H', cx: 0.6, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('H')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'J', keytext: 'J', cx: 0.7, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('J')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'K', keytext: 'K', cx: 0.8, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('K')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'L', keytext: 'L', cx: 0.9, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('L')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'Z', keytext: 'Z', cx: 0.2, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('Z')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'X', keytext: 'X', cx: 0.3, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('X')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'C', keytext: 'C', cx: 0.4, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('C')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'V', keytext: 'V', cx: 0.5, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('V')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'B', keytext: 'B', cx: 0.6, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('B')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'N', keytext: 'N', cx: 0.7, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('N')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'M', keytext: 'M', cx: 0.8, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('M')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: SwipeAction.start, onMove: SwipeAction.move, onUp: SwipeAction.up },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'unshift', keytext: '⇪', cx: 0.075, cy: 5/8, w: 0.15, h: 0.25,
                click: function() { switchLayout(0) },
                timeout: 99999,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'bs', keytext: '⌫', cx: 0.925, cy: 5/8, w: 0.15, h: 0.25,
                click: Terminal.backspace,
                timeout: 200,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: Terminal.delGroupBefore},
                longpress: {onEnter: RepeatBackspaceAction.start, onMove: RepeatBackspaceAction.move, onUp: RepeatBackspaceAction.up } },
            {keyid: 'tosym', keytext: '&123', cx: 0.075, cy: 7/8, w: 0.15, h: 0.25,
                click: function() { switchLayout(2) },
                timeout: 99999,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'nl', keytext: '↩', cx: 0.925, cy: 7/8, w: 0.15, h: 0.25,
                click: function() {Terminal.newLine(); switchLayout(0)},
                timeout: 200,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
                longpress: {onEnter: RepeatNewlineAction.start, onMove: RepeatNewlineAction.move, onUp: RepeatNewlineAction.up } },
            {keyid: 'sp', keytext: ' ', cx: 0.5, cy: 7/8, w: 0.3, h: 0.25,
                click: Terminal.insert(' '),
                timeout: 200,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: Terminal.insertSoftTab},
                longpress: {onEnter: RepeatSpaceAction.start, onMove: RepeatSpaceAction.move, onUp: RepeatSpaceAction.up } },
            {keyid: 'dot', keytext: '.', cx: 0.8, cy: 7/8, w:0.1, h: 0.25,
                click: function() {Terminal.insert('.')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'dash', keytext: '-', cx: 0.7, cy: 7/8, w:0.1, h: 0.25,
                click: function() {Terminal.insert('-')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'shiftcursor', keytext: '✥', cx: 0.2, cy: 7/8, w:0.1, h: 0.25,
                click: Terminal.moveCursorLeft,
                timeout: 500 /*ms*/,
                swipe: {onEnter: CursorAction.start, onMove: CursorAction.move, onUp: CursorAction.up },
                longpress: {onEnter: RepeatCursorDownAction.start, onMove: RepeatCursorDownAction.move, onUp: RepeatCursorDownAction.up } },
            {keyid: 'alt', keytext: 'alt', cx: 0.3, cy: 7/8, w:0.1, h: 0.25, fontSize: '1.5rem',
                click: function() { switchLayout(5) },
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
        ],
        // layout 2 - NUMBERS & SYMBOLS
        [
            {keyid: 'num1', keytext: '1', cx: 0.05, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('1')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'num2', keytext: '2', cx: 0.15, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('2')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'num3', keytext: '3', cx: 0.25, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('3')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'num4', keytext: '4', cx: 0.35, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('4')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'num5', keytext: '5', cx: 0.45, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('5')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'num6', keytext: '6', cx: 0.55, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('6')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'num7', keytext: '7', cx: 0.65, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('7')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'num8', keytext: '8', cx: 0.75, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('8')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'num9', keytext: '9', cx: 0.85, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('9')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'num0', keytext: '0', cx: 0.95, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('0')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },

            {keyid: 'caret', keytext: '^', cx: 0.05, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('^')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'dollar', keytext: '$', cx: 0.15, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('$')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'asterisk', keytext: '*', cx: 0.25, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('*')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'plus', keytext: '+', cx: 0.35, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('+')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'question', keytext: '?', cx: 0.45, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('?')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'tilde', keytext: '~', cx: 0.55, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('~')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'underscore', keytext: '_', cx: 0.65, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('_')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'ampersand', keytext: '&', cx: 0.75, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('&')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'at', keytext: '@', cx: 0.85, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('@')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'colon', keytext: ':', cx: 0.95, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert(':')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },

            {keyid: 'quote', keytext: '\'', cx: 0.20, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('\'')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'doublequote', keytext: '"', cx: 0.30, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('"')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'langlebracket', keytext: '<', cx: 0.40, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('<')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'ranglebracket', keytext: '>', cx: 0.50, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('>')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'pipe', keytext: '|', cx: 0.60, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('|')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'backquote', keytext: '`', cx: 0.70, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('`')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'comma', keytext: ',', cx: 0.80, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert(',')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },

            {keyid: 'nextsym', keytext: '→', cx: 0.075, cy: 5/8, w: 0.15, h: 0.25,
                click: function() { switchLayout(3) },
                timeout: 99999,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'bs', keytext: '⌫', cx: 0.925, cy: 5/8, w: 0.15, h: 0.25,
                click: Terminal.backspace,
                timeout: 200,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: Terminal.delGroupBefore},
                longpress: {onEnter: RepeatBackspaceAction.start, onMove: RepeatBackspaceAction.move, onUp: RepeatBackspaceAction.up } },
            {keyid: 'abc', keytext: 'abc', cx: 0.075, cy: 7/8, w: 0.15, h: 0.25,
                click: function() { switchLayout(0) },
                timeout: 99999,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'nl', keytext: '↩', cx: 0.925, cy: 7/8, w: 0.15, h: 0.25,
                click: function() {Terminal.newLine();},
                timeout: 200,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
                longpress: {onEnter: RepeatNewlineAction.start, onMove: RepeatNewlineAction.move, onUp: RepeatNewlineAction.up } },
            {keyid: 'sp', keytext: ' ', cx: 0.5, cy: 7/8, w: 0.3, h: 0.25,
                click: Terminal.insert(' '),
                timeout: 200,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: Terminal.insertSoftTab},
                longpress: {onEnter: RepeatSpaceAction.start, onMove: RepeatSpaceAction.move, onUp: RepeatSpaceAction.up } },
            {keyid: 'slash', keytext: '/', cx: 0.8, cy: 7/8, w:0.1, h: 0.25,
                click: function() {Terminal.insert('/')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'equal', keytext: '=', cx: 0.7, cy: 7/8, w:0.1, h: 0.25,
                click: function() {Terminal.insert('=')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'escape', keytext: 'esc', cx: 0.2, cy: 7/8, w:0.1, h: 0.25, fontSize: '1.5rem',
                click: Terminal.escape,
                timeout: 500 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-sym1', keytext: 'alt', cx: 0.3, cy: 7/8, w:0.1, h: 0.25, fontSize: '1.5rem',
                click: function() { switchLayout(6) },
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
        ],
        // layout 3 - Other Symbols
        [
            {keyid: 'num1', keytext: '1', cx: 0.05, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('1')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'num2', keytext: '2', cx: 0.15, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('2')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'num3', keytext: '3', cx: 0.25, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('3')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'num4', keytext: '4', cx: 0.35, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('4')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'num5', keytext: '5', cx: 0.45, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('5')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'num6', keytext: '6', cx: 0.55, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('6')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'num7', keytext: '7', cx: 0.65, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('7')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'num8', keytext: '8', cx: 0.75, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('8')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'num9', keytext: '9', cx: 0.85, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('9')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'num0', keytext: '0', cx: 0.95, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('0')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },

            {keyid: 'percent', keytext: '%', cx: 0.05, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('%')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'exclaimation', keytext: '!', cx: 0.15, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('!')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'pound', keytext: '#', cx: 0.25, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('#')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'backslash', keytext: '\\', cx: 0.35, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('\\')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'semicolon', keytext: ';', cx: 0.45, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert(';')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'set-font-size', keytext: 'T+', cx: 0.55, cy: 3/8, w: 0.1, h: 0.25,
                click: function() { Terminal.configFontSize(); },
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'nothing2', keytext: ' ', cx: 0.65, cy: 3/8, w: 0.1, h: 0.25,
                click: nullfn,
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'nothing3', keytext: ' ', cx: 0.75, cy: 3/8, w: 0.1, h: 0.25,
                click: nullfn,
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'nothing4', keytext: ' ', cx: 0.85, cy: 3/8, w: 0.1, h: 0.25,
                click: nullfn,
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'nothing5', keytext: ' ', cx: 0.95, cy: 3/8, w: 0.1, h: 0.25,
                click: nullfn,
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },

            {keyid: 'lparen', keytext: '(', cx: 0.20, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('(')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'rparen', keytext: ')', cx: 0.30, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert(')')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'lbracket', keytext: '[', cx: 0.40, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('[')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'rbracket', keytext: ']', cx: 0.50, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert(']')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'lbrace', keytext: '{', cx: 0.60, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('{')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'rbrace', keytext: '}', cx: 0.70, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insert('}')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'input-text', keytext: '…', cx: 0.80, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.inputNonEnglish();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },

            {keyid: 'prevsym', keytext: '←', cx: 0.075, cy: 5/8, w: 0.15, h: 0.25,
                click: function() { switchLayout(2) },
                timeout: 99999,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'bs', keytext: '⌫', cx: 0.925, cy: 5/8, w: 0.15, h: 0.25,
                click: Terminal.backspace,
                timeout: 200,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: Terminal.delGroupBefore},
                longpress: {onEnter: RepeatBackspaceAction.start, onMove: RepeatBackspaceAction.move, onUp: RepeatBackspaceAction.up } },
            {keyid: 'abc', keytext: 'abc', cx: 0.075, cy: 7/8, w: 0.15, h: 0.25,
                click: function() { switchLayout(0) },
                timeout: 99999,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'nl', keytext: '↩', cx: 0.925, cy: 7/8, w: 0.15, h: 0.25,
                click: function() {Terminal.newLine();},
                timeout: 200,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
                longpress: {onEnter: RepeatNewlineAction.start, onMove: RepeatNewlineAction.move, onUp: RepeatNewlineAction.up } },
            {keyid: 'sp', keytext: ' ', cx: 0.5, cy: 7/8, w: 0.3, h: 0.25,
                click: Terminal.insert(' '),
                timeout: 200,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: Terminal.insertSoftTab},
                longpress: {onEnter: RepeatSpaceAction.start, onMove: RepeatSpaceAction.move, onUp: RepeatSpaceAction.up } },
            {keyid: 'nothing6', keytext: ' ', cx: 0.8, cy: 7/8, w:0.1, h: 0.25,
                click: nullfn,
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'nothing7', keytext: ' ', cx: 0.7, cy: 7/8, w:0.1, h: 0.25,
                click: nullfn,
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'del', keytext: 'del', cx: 0.2, cy: 7/8, w:0.1, h: 0.25, fontSize: '1.5rem',
                click: Terminal.deleteKey,
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-sym2', keytext: 'alt', cx: 0.3, cy: 7/8, w:0.1, h: 0.25, fontSize: '1.5rem',
                click: function() { switchLayout(7) },
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
        ],
        // layout 4 - Ctrl
        [
            {keyid: 'ctrl-q', keytext: 'q', cx: 0.05, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertCtrl('Q')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'ctrl-w', keytext: 'w', cx: 0.15, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertCtrl('W')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'ctrl-e', keytext: 'e', cx: 0.25, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertCtrl('E')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'ctrl-r', keytext: 'r', cx: 0.35, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertCtrl('R')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'ctrl-t', keytext: 't', cx: 0.45, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertCtrl('T')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'ctrl-y', keytext: 'y', cx: 0.55, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertCtrl('Y')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'ctrl-u', keytext: 'u', cx: 0.65, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertCtrl('U')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'ctrl-i', keytext: 'i', cx: 0.75, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertCtrl('I')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'ctrl-o', keytext: 'o', cx: 0.85, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertCtrl('O')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'ctrl-p', keytext: 'p', cx: 0.95, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertCtrl('P')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'ctrl-a', keytext: 'a', cx: 0.1, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertCtrl('A')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'ctrl-s', keytext: 's', cx: 0.2, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertCtrl('S')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'ctrl-d', keytext: 'd', cx: 0.3, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertCtrl('D')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'ctrl-f', keytext: 'f', cx: 0.4, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertCtrl('F')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'ctrl-g', keytext: 'g', cx: 0.5, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertCtrl('G')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'ctrl-h', keytext: 'h', cx: 0.6, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertCtrl('H')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'ctrl-j', keytext: 'j', cx: 0.7, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertCtrl('J')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'ctrl-k', keytext: 'k', cx: 0.8, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertCtrl('K')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'ctrl-l', keytext: 'l', cx: 0.9, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertCtrl('L')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'ctrl-z', keytext: 'z', cx: 0.2, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertCtrl('Z')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'ctrl-x', keytext: 'x', cx: 0.3, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertCtrl('X')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'ctrl-c', keytext: 'c', cx: 0.4, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertCtrl('C')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'ctrl-v', keytext: 'v', cx: 0.5, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertCtrl('V')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'ctrl-b', keytext: 'b', cx: 0.6, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertCtrl('B')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'ctrl-n', keytext: 'n', cx: 0.7, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertCtrl('N')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'ctrl-m', keytext: 'm', cx: 0.8, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertCtrl('M')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'shift', keytext: '⇧', cx: 0.075, cy: 5/8, w: 0.15, h: 0.25,
                click: function() { switchLayout(1) },
                timeout: 99999,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'bs', keytext: '⌫', cx: 0.925, cy: 5/8, w: 0.15, h: 0.25,
                click: Terminal.backspace,
                timeout: 200,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: Terminal.delGroupBefore},
                longpress: {onEnter: RepeatBackspaceAction.start, onMove: RepeatBackspaceAction.move, onUp: RepeatBackspaceAction.up } },
            {keyid: 'tosym', keytext: '&123', cx: 0.075, cy: 7/8, w: 0.15, h: 0.25,
                click: function() { switchLayout(2) },
                timeout: 99999,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'nl', keytext: '↩', cx: 0.925, cy: 7/8, w: 0.15, h: 0.25,
                click: function() {Terminal.newLine(); switchLayout(0)},
                timeout: 200,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
                longpress: {onEnter: RepeatNewlineAction.start, onMove: RepeatNewlineAction.move, onUp: RepeatNewlineAction.up } },
            {keyid: 'sp', keytext: ' ', cx: 0.5, cy: 7/8, w: 0.3, h: 0.25,
                click: Terminal.insert(' '),
                timeout: 200,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: Terminal.insertSoftTab},
                longpress: {onEnter: RepeatSpaceAction.start, onMove: RepeatSpaceAction.move, onUp: RepeatSpaceAction.up } },
            {keyid: 'dot', keytext: '.', cx: 0.8, cy: 7/8, w:0.1, h: 0.25,
                click: function() {Terminal.insert('.')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'dash', keytext: '-', cx: 0.7, cy: 7/8, w:0.1, h: 0.25,
                click: function() {Terminal.insert('-')();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'shiftcursor', keytext: '✥', cx: 0.2, cy: 7/8, w:0.1, h: 0.25,
                click: Terminal.moveCursorLeft,
                timeout: 500 /*ms*/,
                swipe: {onEnter: CursorAction.start, onMove: CursorAction.move, onUp: CursorAction.up },
                longpress: {onEnter: RepeatCursorDownAction.start, onMove: RepeatCursorDownAction.move, onUp: RepeatCursorDownAction.up } },
            {keyid: 'unctrl', keytext: 'CTRL', cx: 0.3, cy: 7/8, w:0.1, h: 0.25, fontSize: '1.5rem',
                click: function() { switchLayout(0) },
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } }
        ],
        // layout 5 - ALT Letter
        [
            {keyid: 'alt-q', keytext: 'Q', cx: 0.05, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('Q')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-w', keytext: 'W', cx: 0.15, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('W')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-e', keytext: 'E', cx: 0.25, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('E')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-r', keytext: 'R', cx: 0.35, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('R')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-t', keytext: 'T', cx: 0.45, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('T')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-y', keytext: 'Y', cx: 0.55, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('Y')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-u', keytext: 'U', cx: 0.65, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('U')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-i', keytext: 'I', cx: 0.75, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('I')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-o', keytext: 'O', cx: 0.85, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('O')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-p', keytext: 'P', cx: 0.95, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('P')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-a', keytext: 'A', cx: 0.1, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('A')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-s', keytext: 'S', cx: 0.2, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('S')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-d', keytext: 'D', cx: 0.3, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('D')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-f', keytext: 'F', cx: 0.4, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('F')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-g', keytext: 'G', cx: 0.5, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('G')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-h', keytext: 'H', cx: 0.6, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('H')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-j', keytext: 'J', cx: 0.7, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('J')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-k', keytext: 'K', cx: 0.8, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('K')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-l', keytext: 'L', cx: 0.9, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('L')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-z', keytext: 'Z', cx: 0.2, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('Z')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-x', keytext: 'X', cx: 0.3, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('X')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-c', keytext: 'C', cx: 0.4, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('C')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-v', keytext: 'V', cx: 0.5, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('V')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-b', keytext: 'B', cx: 0.6, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('B')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-n', keytext: 'N', cx: 0.7, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('N')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-m', keytext: 'M', cx: 0.8, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('M')(); switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn, },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'shift', keytext: '⇧', cx: 0.075, cy: 5/8, w: 0.15, h: 0.25,
                click: function() { switchLayout(1) },
                timeout: 99999,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'bs', keytext: '⌫', cx: 0.925, cy: 5/8, w: 0.15, h: 0.25,
                click: Terminal.backspace,
                timeout: 200,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: Terminal.delGroupBefore},
                longpress: {onEnter: RepeatBackspaceAction.start, onMove: RepeatBackspaceAction.move, onUp: RepeatBackspaceAction.up } },
            {keyid: 'tosym', keytext: '&123', cx: 0.075, cy: 7/8, w: 0.15, h: 0.25,
                click: function() { switchLayout(2) },
                timeout: 99999,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'nl', keytext: '↩', cx: 0.925, cy: 7/8, w: 0.15, h: 0.25,
                click: function() {Terminal.newLine(); switchLayout(0)},
                timeout: 200,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
                longpress: {onEnter: RepeatNewlineAction.start, onMove: RepeatNewlineAction.move, onUp: RepeatNewlineAction.up } },
            {keyid: 'sp', keytext: ' ', cx: 0.5, cy: 7/8, w: 0.3, h: 0.25,
                click: Terminal.insert(' '),
                timeout: 200,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: Terminal.insertSoftTab},
                longpress: {onEnter: RepeatSpaceAction.start, onMove: RepeatSpaceAction.move, onUp: RepeatSpaceAction.up } },
            {keyid: 'alt-dot', keytext: '.', cx: 0.8, cy: 7/8, w:0.1, h: 0.25,
                click: function() {Terminal.insertAlt('.')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-dash', keytext: '-', cx: 0.7, cy: 7/8, w:0.1, h: 0.25,
                click: function() {Terminal.insertAlt('-')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'shiftcursor', keytext: '✥', cx: 0.2, cy: 7/8, w:0.1, h: 0.25,
                click: Terminal.moveCursorLeft,
                timeout: 500 /*ms*/,
                swipe: {onEnter: CursorAction.start, onMove: CursorAction.move, onUp: CursorAction.up },
                longpress: {onEnter: RepeatCursorDownAction.start, onMove: RepeatCursorDownAction.move, onUp: RepeatCursorDownAction.up } },
            {keyid: 'unalt', keytext: 'ALT', cx: 0.3, cy: 7/8, w:0.1, h: 0.25, fontSize: '1.5rem',
                click: function() { switchLayout(0) },
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
        ],
        // layout 6 - ALT + NUMBERS & SYMBOLS
        [
            {keyid: 'alt-num1', keytext: '1', cx: 0.05, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('1')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-num2', keytext: '2', cx: 0.15, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('2')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-num3', keytext: '3', cx: 0.25, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('3')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-num4', keytext: '4', cx: 0.35, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('4')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-num5', keytext: '5', cx: 0.45, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('5')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-num6', keytext: '6', cx: 0.55, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('6')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-num7', keytext: '7', cx: 0.65, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('7')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-num8', keytext: '8', cx: 0.75, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('8')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-num9', keytext: '9', cx: 0.85, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('9')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-num0', keytext: '0', cx: 0.95, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('0')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },

            {keyid: 'alt-caret', keytext: '^', cx: 0.05, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('^')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-dollar', keytext: '$', cx: 0.15, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('$')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-asterisk', keytext: '*', cx: 0.25, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('*')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-plus', keytext: '+', cx: 0.35, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('+')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-question', keytext: '?', cx: 0.45, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('?')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-tilde', keytext: '~', cx: 0.55, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('~')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-underscore', keytext: '_', cx: 0.65, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('_')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-ampersand', keytext: '&', cx: 0.75, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('&')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-at', keytext: '@', cx: 0.85, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('@')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-colon', keytext: ':', cx: 0.95, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt(':')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },

            {keyid: 'alt-quote', keytext: '\'', cx: 0.20, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('\'')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-doublequote', keytext: '"', cx: 0.30, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('"')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-langlebracket', keytext: '<', cx: 0.40, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('<')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-ranglebracket', keytext: '>', cx: 0.50, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('>')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-pipe', keytext: '|', cx: 0.60, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('|')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-backquote', keytext: '`', cx: 0.70, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('`')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-comma', keytext: ',', cx: 0.80, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt(',')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },

            {keyid: 'alt-nextsym', keytext: '→', cx: 0.075, cy: 5/8, w: 0.15, h: 0.25,
                click: function() { switchLayout(7) },
                timeout: 99999,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'bs', keytext: '⌫', cx: 0.925, cy: 5/8, w: 0.15, h: 0.25,
                click: Terminal.backspace,
                timeout: 200,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: Terminal.delGroupBefore},
                longpress: {onEnter: RepeatBackspaceAction.start, onMove: RepeatBackspaceAction.move, onUp: RepeatBackspaceAction.up } },
            {keyid: 'abc', keytext: 'abc', cx: 0.075, cy: 7/8, w: 0.15, h: 0.25,
                click: function() { switchLayout(0) },
                timeout: 99999,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'nl', keytext: '↩', cx: 0.925, cy: 7/8, w: 0.15, h: 0.25,
                click: function() {Terminal.newLine();},
                timeout: 200,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
                longpress: {onEnter: RepeatNewlineAction.start, onMove: RepeatNewlineAction.move, onUp: RepeatNewlineAction.up } },
            {keyid: 'sp', keytext: ' ', cx: 0.5, cy: 7/8, w: 0.3, h: 0.25,
                click: Terminal.insert(' '),
                timeout: 200,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: Terminal.insertSoftTab},
                longpress: {onEnter: RepeatSpaceAction.start, onMove: RepeatSpaceAction.move, onUp: RepeatSpaceAction.up } },
            {keyid: 'alt-slash', keytext: '/', cx: 0.8, cy: 7/8, w:0.1, h: 0.25,
                click: function() {Terminal.insertAlt('/')();switchLayout(0);},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-equal', keytext: '=', cx: 0.7, cy: 7/8, w:0.1, h: 0.25,
                click: function() {Terminal.insertAlt('=')();switchLayout(0);},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'escape', keytext: 'esc', cx: 0.2, cy: 7/8, w:0.1, h: 0.25, fontSize: '1.5rem',
                click: Terminal.escape,
                timeout: 500 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'unalt', keytext: 'ALT', cx: 0.3, cy: 7/8, w:0.1, h: 0.25, fontSize: '1.5rem',
                click: function() { switchLayout(0) },
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
        ],
        // layout 7 - ALT + Other Symbols
        [
            {keyid: 'alt-num1', keytext: '1', cx: 0.05, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('1')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-num2', keytext: '2', cx: 0.15, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('2')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-num3', keytext: '3', cx: 0.25, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('3')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-num4', keytext: '4', cx: 0.35, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('4')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-num5', keytext: '5', cx: 0.45, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('5')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-num6', keytext: '6', cx: 0.55, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('6')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-num7', keytext: '7', cx: 0.65, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('7')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-num8', keytext: '8', cx: 0.75, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('8')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-num9', keytext: '9', cx: 0.85, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('9')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-num0', keytext: '0', cx: 0.95, cy: 1/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('0')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },

            {keyid: 'alt-percent', keytext: '%', cx: 0.05, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('%')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-exclaimation', keytext: '!', cx: 0.15, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('!')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-pound', keytext: '#', cx: 0.25, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('#')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-backslash', keytext: '\\', cx: 0.35, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('\\')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-semicolon', keytext: ';', cx: 0.45, cy: 3/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt(';')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'set-font-size', keytext: 'T+', cx: 0.55, cy: 3/8, w: 0.1, h: 0.25,
                click: function() { Terminal.configFontSize(); },
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'nothing2', keytext: ' ', cx: 0.65, cy: 3/8, w: 0.1, h: 0.25,
                click: nullfn,
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'nothing3', keytext: ' ', cx: 0.75, cy: 3/8, w: 0.1, h: 0.25,
                click: nullfn,
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'nothing4', keytext: ' ', cx: 0.85, cy: 3/8, w: 0.1, h: 0.25,
                click: nullfn,
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'nothing5', keytext: ' ', cx: 0.95, cy: 3/8, w: 0.1, h: 0.25,
                click: nullfn,
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },

            {keyid: 'alt-lparen', keytext: '(', cx: 0.20, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('(')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-rparen', keytext: ')', cx: 0.30, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt(')')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-lbracket', keytext: '[', cx: 0.40, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('[')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-rbracket', keytext: ']', cx: 0.50, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt(']')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-lbrace', keytext: '{', cx: 0.60, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('{')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'alt-rbrace', keytext: '}', cx: 0.70, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.insertAlt('}')();switchLayout(0)},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'input-text', keytext: '…', cx: 0.80, cy: 5/8, w: 0.1, h: 0.25,
                click: function() {Terminal.inputNonEnglish();},
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },

            {keyid: 'alt-prevsym', keytext: '←', cx: 0.075, cy: 5/8, w: 0.15, h: 0.25,
                click: function() { switchLayout(6) },
                timeout: 99999,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'bs', keytext: '⌫', cx: 0.925, cy: 5/8, w: 0.15, h: 0.25,
                click: Terminal.backspace,
                timeout: 200,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: Terminal.delGroupBefore},
                longpress: {onEnter: RepeatBackspaceAction.start, onMove: RepeatBackspaceAction.move, onUp: RepeatBackspaceAction.up } },
            {keyid: 'abc', keytext: 'abc', cx: 0.075, cy: 7/8, w: 0.15, h: 0.25,
                click: function() { switchLayout(0) },
                timeout: 99999,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'nl', keytext: '↩', cx: 0.925, cy: 7/8, w: 0.15, h: 0.25,
                click: function() {Terminal.newLine();},
                timeout: 200,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn},
                longpress: {onEnter: RepeatNewlineAction.start, onMove: RepeatNewlineAction.move, onUp: RepeatNewlineAction.up } },
            {keyid: 'sp', keytext: ' ', cx: 0.5, cy: 7/8, w: 0.3, h: 0.25,
                click: Terminal.insert(' '),
                timeout: 200,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: Terminal.insertSoftTab},
                longpress: {onEnter: RepeatSpaceAction.start, onMove: RepeatSpaceAction.move, onUp: RepeatSpaceAction.up } },
            {keyid: 'nothing8', keytext: ' ', cx: 0.8, cy: 7/8, w:0.1, h: 0.25,
                click: nullfn,
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'nothing9', keytext: ' ', cx: 0.7, cy: 7/8, w:0.1, h: 0.25,
                click: nullfn,
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'del', keytext: 'del', cx: 0.2, cy: 7/8, w:0.1, h: 0.25, fontSize: '1.5rem',
                click: Terminal.deleteKey,
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
            {keyid: 'unalt', keytext: 'ALT', cx: 0.3, cy: 7/8, w:0.1, h: 0.25, fontSize: '1.5rem',
                click: function() { switchLayout(0) },
                timeout: 400 /*ms*/,
                swipe: {onEnter: nullfn, onMove: nullfn, onUp: nullfn },
                longpress: {onEnter: nullfn, onMove: nullfn, onUp: nullfn } },
        ],
    ]
    var _layoutsSVG = [] //*svg group* for each layout
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
        for(var i = 0; i < _layoutsConfig[_currLayout].length; i++) {
            var key = _layoutsConfig[_currLayout][i]
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
        _layoutsSVG[ith] = layout

        for(var i = 0; i < _layoutsConfig[ith].length; i++) {
            var key = _layoutsConfig[ith][i]
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

    var initLayouts = function() {
        var kbdw = _width
        var kbdh = _height
        for(var cnt = 0; cnt < _layoutsConfig.length; cnt++) {
            var layout = _keyboardSVG.group()
            layout.attr('id','layout-'+String(cnt))
            _layoutsSVG.push(layout)

            for(var i = 0; i < _layoutsConfig[cnt].length; i++) {
                var key = _layoutsConfig[cnt][i]
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
    }

    var switchLayout = function(num) {
        if(_layoutsSVG[_currLayout]) {
            _layoutsSVG[_currLayout].hide()
        }

        if(!_layoutsSVG[num]) {
            initLayout(num)
        }

        _layoutsSVG[num].show()
        _currLayout = num
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
            currHighlight = _layoutsSVG[_currLayout].node.querySelector('#'+downState.key.keyid+'-key rect')

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

        // initLayouts()

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
        resize: resizeEvent
    }
})(Terminal, Analyzer)
Keyboard.initialize(document.getElementById('container'))

