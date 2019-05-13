const URL = require("url");
const { tcpSession, tlsSession } = require("./tcpOrTlsSession");
const udpSession = require("./udpSession");
const { requestOptions } = require("../parsing/requestParsing");
const sshSession = require("./sshSession");
const { defaultPort } = require("../parsing/utils");

function enterSession(parsedArgs) {
    const protocols = {
        "--tcp": tcpSession,
        "--udp": udpSession,
        "--tls": tlsSession,
        "--ssh": sshSession
    };
    const protocol = Object.keys(parsedArgs).filter(key => Object.keys(protocols).includes(key))[0];
    const url = URL.parse("http://" + parsedArgs[protocol]);
    if (!url.port) {
        url.port = defaultPort(protocol);
    }
    const options = requestOptions(parsedArgs, "http://" + parsedArgs[protocol]);
    return protocols[protocol](url.port, url.hostname, options, parsedArgs);
}

module.exports = enterSession;
