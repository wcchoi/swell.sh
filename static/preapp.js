(function() {
    window.OriginalTerminal = Terminal;

    var termOption = {
    };

    var term = new OriginalTerminal(termOption);

    window.term = term;

    var protocol = (location.protocol === 'https:') ? 'wss://' : 'ws://';
    var socketURL = protocol + location.hostname + ((location.port) ? (':' + location.port) : '') + "/websocket";
    var sock = new ReconnectingWebSocket(socketURL);
    var terminadoAddon = new TerminadoAddon.TerminadoAddon(sock)

    console.log("new sock");
    // term.setOption("fontSize", 12);
    sock.addEventListener('open', function () {
        console.log("sock open");
        term.loadAddon(terminadoAddon)
    });

    sock.addEventListener('close', function() {
        console.log("sock close");
        iziToast.show({
            message: 'connection closed, retrying',
            position: 'topRight',
        })
    });

    term.open(document.getElementById('terminal-container'));

    var webgl2Supported = !!document.createElement('canvas').getContext('webgl2');
    if (webgl2Supported) {
        var webglAddon = new WebglAddon.WebglAddon()
        term.loadAddon(webglAddon)
    }

    var fitAddon = new FitAddon.FitAddon()
    term.fitAddon = fitAddon
    term.loadAddon(fitAddon)

    var hideOSKeyboard = setInterval(function() {
        if(term.textarea) {
            term.textarea.readOnly = true; // disable built-in keyboard poping up in mobile
            // term.on('blur', function(e) { term.focus(); })

            // This is only for Canvas Renderer Type
            var crl = term._core._renderService._renderer._renderLayers.slice(-1)[0]
            crl._renderBlurCursor = crl._renderBlockCursor // always show as if focused

            clearInterval(hideOSKeyboard)

            term.textarea.blur();

            setTimeout(function() {term.focus();}, 50);
            setTimeout(function() {term.blur(); }, 100);
            setTimeout(function() {term.textarea.disabled = true; }, 150);
            term.fitAddon.fit()
            var fontSize = localStorage.getItem('terminal-font-size') || 12;
            fontSize = Number(fontSize)
            console.log('fontSize:', fontSize)
            Terminal.setFontSize(fontSize);
        }
    }, 100);
})()
