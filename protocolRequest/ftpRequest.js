const net = require("net");
const fs = require("fs");

function getIpPortFromPASV(output) {
    const leftBrack = output.indexOf("(");
    const rightBrack = output.indexOf(")");
    const ipPort = output.slice(leftBrack + 1, rightBrack).split(",");
    const ip = ipPort.slice(0, 4).join(".");
    const port = parseInt(ipPort[4]) * 256 + parseInt(ipPort[5]);
    return { ip, port };
}

function pipeToFile(resolve, clientCon, con, filename) {
    const outFile = fs.createWriteStream(filename);
    clientCon.pipe(outFile);
    clientCon.on("end", () => {
        resolve(`File ${filename} created`);
        outFile.end();
        con.end();
    });
}

function resolveToLog(resolve, clientCon, con) {
    let res = "";
    clientCon.on("data", chunk => (res += chunk));
    clientCon.on("end", () => {
        resolve(res);
        con.end();
    });
}

function ftpRequest(request, { options, parsedArgs, makeSingleRequest }) {
    return new Promise((resolve, reject) => {
        const con = net.connect(request.port, request.host, () => {
            con.write(`USER ${options.userPass.user}\r\n`);
            con.write(`${options.userPass.pass}\r\n`);
            con.write("PASV\r\n");
        });
        con.on("data", chunk => {
            const stringedChunk = chunk.toString();
            if (parsedArgs["-v"]) {
                console.log(stringedChunk);
            }
            if (stringedChunk.match(/227 Entering Passive Mode/)) {
                const { ip, port } = getIpPortFromPASV(stringedChunk);
                const clientCon = net.connect(port, ip);
                con.write(parsedArgs["-H"].join("\r\n") + "\r\n");
                clientCon.on("error", err => reject(err));
                if (options.pipeToFile) {
                    pipeToFile(resolve, clientCon, con, options.pipeToFile);
                } else {
                    resolveToLog(resolve, clientCon, con);
                }
            }
        });
    });
}

module.exports = ftpRequest;
