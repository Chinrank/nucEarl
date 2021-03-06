const net = require("net");
const tls = require("tls");
const { makeProxy } = require("../ProxyAgent");

function handleInput(srvSocket) {
    let writeString = "";
    process.stdin.on("data", chunk => {
        writeString += chunk.toString().trim() + "\r\n";
        if (writeString.slice(writeString.length - 4) === "\r\n\r\n") {
            srvSocket.write(writeString);
            writeString = "";
        }
    });
}

function tcpSession(port, address, options) {
    if (!options.proxy) {
        const srvSocket = net.connect(port, address, () => {
            srvSocket.pipe(process.stdout);
            handleInput(srvSocket);
        });
    } else {
        const { proxy, conOptions } = makeProxy(port, address, options, false);
        proxy.createConnection(conOptions, (err, socket) => {
            socket.pipe(process.stdout);
            handleInput(socket);
        });
    }
}

// I know these look similar but they'll probably deviate in the future.
function tlsSession(port, address, options) {
    if (!options.proxy) {
        const srvSocket = tls.connect(port, address, () => {
            srvSocket.pipe(process.stdout);
            handleInput(srvSocket);
        });
    } else {
        const { proxy, conOptions } = makeProxy(port, address, options, true);
        proxy.createConnection(conOptions, (err, socket) => {
            socket.pipe(process.stdout);
            handleInput(socket);
        });
    }
}

module.exports = { tcpSession, tlsSession };
