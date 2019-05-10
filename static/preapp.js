(function() {
    window.OriginalTerminal = Terminal;
    terminado.apply(OriginalTerminal);
    OriginalTerminal.applyAddon(fit);  // Apply the `fit` addon

    var fontSize = localStorage.getItem('terminal-font-size') || 12;
    fontSize = Number(fontSize)
    console.log('fontSize:', fontSize)

    // For older version iOS (~Safari 7): uncomment if needed
    // setTimeout(function() { term.fit() }, 2000);
    // setTimeout(function() {term.setOption('rendererType', 'dom');}, 2100);

    var termOption = {
        fontSize: fontSize,
    };
    var webgl2Supported = !!document.createElement('canvas').getContext('webgl2');
    if (webgl2Supported) {
        termOption.experimentalCharAtlas = 'webgl';
        termOption.rendererType = 'webgl';
    }

    var term = new OriginalTerminal(termOption);

    window.term = term;

    var protocol = (location.protocol === 'https:') ? 'wss://' : 'ws://';
    var socketURL = protocol + location.hostname + ((location.port) ? (':' + location.port) : '') + "/websocket";
    var sock = new ReconnectingWebSocket(socketURL);
    // var sock = new WebSocket(socketURL);

    console.log("new sock");
    // term.setOption("fontSize", 12);
    sock.addEventListener('open', function () {
        console.log("sock open");
        term.terminadoAttach(sock);
    });

    sock.addEventListener('close', function() {
        console.log("sock close");
        iziToast.show({
            message: 'connection closed, retrying',
            position: 'topRight',
        })
    });

    term.open(document.getElementById('terminal-container'));

    var hideOSKeyboard = setInterval(function() {
        if(term.textarea) {
            term.textarea.readOnly = true; // disable built-in keyboard poping up in mobile
            // term.on('blur', function(e) { term.focus(); })

            // This is only for Canvas Renderer Type
            var crl = term._core.renderer._renderLayers.slice(-1)[0] // CursorRenderLayer
            crl._renderBlurCursor = crl._renderBlockCursor // always show as if focused

            clearInterval(hideOSKeyboard)

            term.textarea.blur();

            setTimeout(function() {term.focus();}, 50);
            setTimeout(function() {term.blur(); }, 100);
            setTimeout(function() {term.textarea.disabled = true; }, 150);
            term.fit()
        }
    }, 100);
})()
