const http = require("http");
const https = require("https");
const tls = require("tls");

class HttpsProxyAgent extends https.Agent {
    constructor(options) {
        super(options);
        constructProxy(this, options);
    }
}

class HttpProxyAgent extends http.Agent {
    constructor(options) {
        super(options);
        constructProxy(this, options);
    }
}

function constructProxy(proxy, options) {
    proxy.ca = options.ca;
    proxy.ignoreSecurity = options.ignoreSecurity;
    proxy.secure = options.secure;
    proxy.proxyProtocol = options.proxyProtocol;
    proxy.proxyHost = options.proxyHost;
    proxy.proxyPort = options.proxyPort;
    proxy.createConnection = (opts, callback) => createConnection(proxy, opts, callback);
}

function createConnection(proxy, opts, callback) {
    const requestToSend = {
        host: proxy.proxyHost,
        port: proxy.proxyPort,
        method: "CONNECT",
        path: opts.host + ":" + opts.port,
        headers: {
            host: opts.host
        }
    };
    const req = proxy.proxyProtocol.request(requestToSend);
    req.on("connect", (res, socket, head) => {
        if (proxy.secure) {
            const secureChan = {
                host: opts.host,
                socket: socket,
                rejectUnauthorized: proxy.ignoreSecurity,
                servername: opts.host
            };
            if (proxy.ca) {
                secureChan.ca = proxy.ca;
            }
            const cts = tls.connect(secureChan, () => {
                callback(false, cts);
            });
        } else {
            callback(false, socket);
        }
    });
    req.on("error", err => callback(err, null));
    req.end();
}

function ProxyAgent(options) {
    if (options.secure) {
        return new HttpsProxyAgent(options);
    } else {
        return new HttpProxyAgent(options);
    }
}

function makeProxy(port, address, options, secure) {
    const proxy = {};
    const conOptions = {
        ca: options.ca,
        ignoreSecurity: options.ignoreSecurity,
        secure: secure,
        proxyProtocol: options.proxy.protocol === "https:" ? https : http,
        proxyHost: options.proxy.hostname,
        proxyPort: options.proxy.port,
        host: address,
        port: port
    };
    constructProxy(proxy, conOptions);
    return { proxy, conOptions };
}

module.exports = { ProxyAgent, constructProxy, makeProxy };
