const net = require("net");
const crypto = require("crypto");
const {
    parsePacket,
    writePacket,
    writeKeyExchange,
    parseKeyExchange,
    parseECKey,
    writeInitKexPacket,
    computeExchangeHash,
    generateEncrypterDecrypter,
    encryptAddHmac
} = require("../parsing/sshParsing");
const { makeProxy } = require("../ProxyAgent");

//https://tools.ietf.org/html/rfc4251#page-10

const V_C = Buffer.from("SSH-2.0-OpenSSH_7.4p1");
let V_S;
let I_C;
let I_S;
let K_S;
let Q_C;
let Q_S;
let K;
let hash;
let hmacKey;
let decrypt;
let encrypt;
let remainder = "";
let state = "resolvingInitialHeaders";
let nextState = "";
let sentMessageCount = -1;
let log;
let resultChunk = Buffer.alloc(0);
let resultLenBuff;
let theResult = Buffer.alloc(0);
let theExtendedResult = Buffer.alloc(0);

function doHeaders(chunk, srvSocket) {
    srvSocket.write(V_C + "\r\n"); //Send our ssh header
    log(chunk.toString());
    V_S = Buffer.from(chunk.toString().trim()); //store theirs, needed for hashes
    sentMessageCount++;
    state = "KEX_INIT";
}

function doKex(chunk, srvSocket, keyDetails) {
    const recievedPacket = parseKeyExchange(chunk);
    logPacket(recievedPacket.parsedPacket);
    I_S = recievedPacket.payload;

    const { packet, payload } = writeKeyExchange();
    I_C = payload;
    srvSocket.write(packet);
    sentMessageCount++;

    const clientKex = writeInitKexPacket(chunk);
    const initKexPacket = clientKex.initKexPacket;
    keyDetails.kex = clientKex.kex;
    keyDetails.pubkey = clientKex.pubkey;
    Q_C = keyDetails.pubkey;
    srvSocket.write(initKexPacket);
    sentMessageCount++;
    state = "KEX_ECDH";
}

function doECDH(chunk, srvSocket, keyDetails) {
    const parsedPacket = parseECKey(chunk);
    remainder = parsedPacket.remainder;
    logPacket(parsedPacket);
    K_S = parsedPacket.hostKey;
    Q_S = parsedPacket.ephPubKey;
    K = keyDetails.kex.computeSecret(Q_S);
    hash = computeExchangeHash(V_C, V_S, I_C, I_S, K_S, Q_C, Q_S, K);

    if (K[0] & 0x80) {
        K = Buffer.concat([Buffer.from("\x00"), K]);
    }
    let KLength = Buffer.alloc(4);
    KLength.writeUInt32BE(K.length);
    K = Buffer.concat([KLength, K]);

    const packetToSend = Buffer.concat([
        Buffer.from("0000000c0a15", "hex"),
        crypto.randomBytes(10)
    ]);
    srvSocket.write(packetToSend);
    sentMessageCount++;
    state = "SSH_AUTH_REQUEST";
}

function sshAuthRequest(chunk, srvSocket) {
    // SSH_MSG_NEWKEYS
    //Time to request ssh-userauth, service request has code 5
    remainder = "";

    log(chunk.toString("hex")); // The same message we sent, keys accepted.
    const { encrypter, hmac, decrypter } = generateEncrypterDecrypter(K, hash);
    hmacKey = hmac.hmacKey;
    decrypt = decrypter;
    encrypt = encrypter;

    const serviceRequesting = Buffer.from("ssh-userauth");
    const infoLength = Buffer.alloc(4);
    infoLength.writeUInt32BE(serviceRequesting.length);
    const SERVICE_REQUEST = Buffer.from("\x05");
    const payload = Buffer.concat([SERVICE_REQUEST, infoLength, serviceRequesting]);

    const packet = writePacket(payload);

    srvSocket.write(encryptAddHmac(packet, encrypt, payload, hmacKey, sentMessageCount));
    sentMessageCount++;
    state = "CONFIRM_USER_AUTH";
}

function confirmUserauthReq(chunk) {
    const len = decrypt.decipher.update(chunk.slice(0, 4));
    const deciphered = decrypt.decipher.update(chunk.slice(4, len.readUInt32BE(0) + 4));
    const decipheredParsed = parsePacket(Buffer.concat([len, deciphered]));
    logPacket(decipheredParsed);
    remainder = chunk.slice(len.readUInt32BE(0) + 4);
    state = "expectingHmac";
    nextState = "SEND_USER_PASS";
}

function sendUserPass(srvSocket, options) {
    const username = options.userPass.user;
    const password = options.userPass.pass;

    const authRequest = Buffer.alloc(1);
    authRequest.writeInt8(50); // as per https://tools.ietf.org/html/rfc4252

    const usernameLen = Buffer.alloc(4);
    usernameLen.writeUInt32BE(username.length);

    const usernameBuff = Buffer.from(username, "utf8");

    const sshConn = Buffer.from("\x00\x00\x00\x0essh-connection");
    const passwordMess = Buffer.from("\x00\x00\x00\x08password");

    const IDontKnow = Buffer.from("\x00"); //I can't recall why this is here

    const passwordLen = Buffer.alloc(4);
    passwordLen.writeUInt32BE(password.length);

    const passwordBuff = Buffer.from(password, "utf8");

    const payload = Buffer.concat([
        authRequest,
        usernameLen,
        usernameBuff,
        sshConn,
        passwordMess,
        IDontKnow,
        passwordLen,
        passwordBuff
    ]);

    const packet = writePacket(payload);
    srvSocket.write(encryptAddHmac(packet, encrypt, payload, hmacKey, sentMessageCount));
    sentMessageCount++;
    remainder = "";
    state = "CONFIRM_AUTH_ACCEPT";
}

function makeSessionRequest(chunk, srvSocket) {
    const len = decrypt.decipher.update(chunk.slice(0, 4));
    const deciphered = decrypt.decipher.update(chunk.slice(4, len.readUInt32BE(0) + 4));
    const decipheredParsed = parsePacket(Buffer.concat([len, deciphered]));
    remainder = chunk.slice(len.readUInt32BE(0) + 4);
    logPacket(decipheredParsed); //payload should be 4 for successful login
    if (decipheredParsed.payload.toString() === "4") {
        //Make a session request
        const payload = Buffer.from(
            "\x5a\x00\x00\x00\x07\x73\x65\x73\x73\x69\x6f\x6e\x00\x00\x00\x00\x00\x10\x00\x00\x00\x00\x80"
        );
        const packet = writePacket(payload);
        log(parsePacket(packet));
        srvSocket.write(encryptAddHmac(packet, encrypt, payload, hmacKey, sentMessageCount));

        sentMessageCount++;
        state = "expectingHmac";
        nextState = "DO_EXEC_REQUEST";
    } else {
        state = "expectingHmac";
        nextState = "CONFIRM_AUTH_ACCEPT";
    }
}

function makeExecRequest(srvSocket, parsedArgs) {
    remainder = "";
    // Time to make an exec request

    const channel_request = Buffer.from("\x62"); // 98 as per https://tools.ietf.org/html/rfc4254
    const channel = Buffer.from("\x00\x00\x00\x00"); //channel 0
    const execMess = Buffer.from("\x00\x00\x00\x04exec");
    const pleaseRespond = Buffer.from("\x01"); // This exec requires a response
    const cmdLength = Buffer.alloc(4);

    const command = parsedArgs["--exec"];
    cmdLength.writeUInt32BE(command.length);

    const cmd = Buffer.from(command);

    const payload = Buffer.concat([
        channel_request,
        channel,
        execMess,
        pleaseRespond,
        cmdLength,
        cmd
    ]);
    const packet = writePacket(payload);
    srvSocket.write(encryptAddHmac(packet, encrypt, payload, hmacKey, sentMessageCount));
    sentMessageCount++;
    state = "DO_REST";
}

function doRest(chunk, srvSocket) {
    if (chunk.length === 0) {
    } else {
        if (resultChunk.length === 0) {
            resultLenBuff = decrypt.decipher.update(chunk.slice(0, 4));
        }
        const packetLength = resultLenBuff.readUInt32BE(0);
        resultChunk = Buffer.concat([resultChunk, chunk]);
        if (resultChunk.length - 4 < packetLength) {
            return; //break early until we have the full packet
        }
        const deciphered = decrypt.decipher.update(resultChunk.slice(4, packetLength + 4));
        const decipheredParsed = parsePacket(Buffer.concat([resultLenBuff, deciphered]));
        remainder = resultChunk.slice(packetLength + 4);
        resultChunk = Buffer.alloc(0);
        resultLen = null;
        logPacket(decipheredParsed);

        if (decipheredParsed.payload[0] === 94) {
            //SSH_MSG_CHANNEL_DATA
            const startPos = 5; //data starts at different pos based on type of data
            const contentLength = decipheredParsed.payload.readUInt32BE(startPos);
            theResult = Buffer.concat([
                theResult,
                decipheredParsed.payload.slice(startPos + 4, startPos + 4 + contentLength)
            ]);
        }
        if (decipheredParsed.payload[0] === 95) {
            //SSH_MSG_CHANNEL_EXTENDED_DATA;
            const startPos = 9; //data starts at different pos based on type of data
            const contentLength = decipheredParsed.payload.readUInt32BE(startPos);
            theExtendedResult = Buffer.concat([
                theExtendedResult,
                decipheredParsed.payload.slice(startPos + 4, startPos + 4 + contentLength)
            ]);
        }
        if (decipheredParsed.payload[0] === 96) {
            console.log(theExtendedResult.toString());
            console.log(theResult.toString());
            srvSocket.destroy();
        }

        state = "expectingHmac";
        nextState = "DO_REST";
    }
}

function sshSession(port, address, options, parsedArgs) {
    log = parsedArgs["-v"] ? console.log : () => 1;
    const keyDetails = { kex: null, pubkey: null, cipher: null };

    if (options.proxy) {
        const { proxy, conOptions } = makeProxy(port, address, options, false);
        proxy.createConnection(conOptions, (err, srvSocket) =>
            doSshSession(srvSocket, keyDetails, options, parsedArgs)
        );
    } else {
        const srvSocket = net.connect(port, address, () =>
            doSshSession(srvSocket, keyDetails, options, parsedArgs)
        );
    }
}

function doSshSession(srvSocket, keyDetails, options, parsedArgs) {
    srvSocket.on("data", chunk => {
        if (state === "expectingHmac") {
            chunk = chunk.slice(32);
            log("hmac recieved");
            remainder = "";
            state = nextState;
        }
        const funcForState = {
            resolvingInitialHeaders: () => doHeaders(chunk, srvSocket),
            KEX_INIT: () => doKex(chunk, srvSocket, keyDetails),
            KEX_ECDH: () => doECDH(chunk, srvSocket, keyDetails),
            SSH_AUTH_REQUEST: () => sshAuthRequest(chunk, srvSocket),
            CONFIRM_USER_AUTH: () => confirmUserauthReq(chunk),
            SEND_USER_PASS: () => sendUserPass(srvSocket, options),
            CONFIRM_AUTH_ACCEPT: () => makeSessionRequest(chunk, srvSocket),
            DO_EXEC_REQUEST: () => makeExecRequest(srvSocket, parsedArgs),
            DO_REST: () => doRest(chunk, srvSocket)
        }[state];
        funcForState && funcForState();

        if (remainder.length !== 0) {
            srvSocket.emit("data", remainder);
        }
    });
}

function logPacket(packet) {
    const stringedRecievedPacket = {};
    Object.keys(packet).forEach(key => {
        stringedRecievedPacket[key] = packet[key].toString();
    });
    log(stringedRecievedPacket);
    log("\n\n");
}

module.exports = sshSession;
