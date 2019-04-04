(function() {
    window.OriginalTerminal = Terminal;
    terminado.apply(OriginalTerminal);
    OriginalTerminal.applyAddon(fit);  // Apply the `fit` addon

    var term = new OriginalTerminal();
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
    // term.fit()

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
        }
    }, 100);
})()
