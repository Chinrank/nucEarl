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

function doHeaders(srvSocket, chunk) {
    srvSocket.write(V_C + "\r\n"); //Send our ssh header
    console.log(chunk.toString());
    V_S = Buffer.from(chunk.toString().trim()); //store theirs, needed for hashes
    sentMessageCount++;
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
}

function sshAuthRequest(chunk, srvSocket) {
    // SSH_MSG_NEWKEYS
    //Time to request ssh-userauth, service request has code 5
    remainder = "";

    console.log(chunk.toString("hex")); // The same message we sent, keys accepted.
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
}

function confirmUserauthReq(chunk) {
    const len = decrypt.decipher.update(chunk.slice(0, 4));
    const deciphered = decrypt.decipher.update(chunk.slice(4, len.readUInt32BE(0) + 4));
    const decipheredParsed = parsePacket(Buffer.concat([len, deciphered]));
    logPacket(decipheredParsed);
    remainder = chunk.slice(len.readUInt32BE(0) + 4);
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
}

function sshSession(port, address, options, parsedArgs) {
    const keyDetails = { kex: null, pubkey: null, cipher: null };
    const srvSocket = net.connect(port, address, () => {
        srvSocket.on("data", chunk => {
            if (state === "expectingHmac") {
                const hmac = chunk.slice(0, 32);
                console.log("hmac is ", hmac);
                chunk = chunk.slice(32);
                remainder = "";
                state = nextState;
            }

            if (state === "resolvingInitialHeaders") {
                doHeaders(srvSocket, chunk);
                state = "KEX_INIT";
            } else if (state === "KEX_INIT") {
                doKex(chunk, srvSocket, keyDetails);
                state = "KEX_ECDH";
            } else if (state === "KEX_ECDH") {
                doECDH(chunk, srvSocket, keyDetails);
                state = "SSH_AUTH_REQUEST";
            } else if (state === "SSH_AUTH_REQUEST") {
                sshAuthRequest(chunk, srvSocket);
                state = "CONFIRM_USER_AUTH";
            } else if (state === "CONFIRM_USER_AUTH") {
                confirmUserauthReq(chunk);
                state = "expectingHmac";
                nextState = "SEND_USER_PASS";
            } else if (state === "SEND_USER_PASS") {
                sendUserPass(srvSocket, options);
                state = "CONFIRM_AUTH_ACCEPT";
            } else if (state === "CONFIRM_AUTH_ACCEPT") {
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
                    console.log(parsePacket(packet));
                    srvSocket.write(
                        encryptAddHmac(packet, encrypt, payload, hmacKey, sentMessageCount)
                    );

                    sentMessageCount++;
                    state = "expectingHmac";
                    nextState = "DO_EXEC_REQUEST";
                } else {
                    state = "expectingHmac";
                    nextState = "CONFIRM_AUTH_ACCEPT";
                }
            } else if (state === "DO_EXEC_REQUEST") {
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
                srvSocket.write(
                    encryptAddHmac(packet, encrypt, payload, hmacKey, sentMessageCount)
                );
                sentMessageCount++;
                state = "DO_REST";
            } else if (state === "DO_REST") {
                if (chunk.length === 0) {
                } else {
                    const len = decrypt.decipher.update(chunk.slice(0, 4));
                    const deciphered = decrypt.decipher.update(
                        chunk.slice(4, len.readUInt32BE(0) + 4)
                    );
                    const decipheredParsed = parsePacket(Buffer.concat([len, deciphered]));
                    remainder = chunk.slice(len.readUInt32BE(0) + 4);
                    logPacket(decipheredParsed);
                    state = "expectingHmac";
                    nextState = "DO_REST";
                }
            }
            if (remainder.length !== 0) {
                srvSocket.emit("data", remainder);
            }
        });
        handleInput(srvSocket);
    });
}
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

function logPacket(packet) {
    const stringedRecievedPacket = {};
    Object.keys(packet).forEach(key => {
        stringedRecievedPacket[key] = packet[key].toString();
    });
    console.log(stringedRecievedPacket);
    console.log("\n\n");
}

module.exports = sshSession;
