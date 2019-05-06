const crypto = require("crypto");

function writePacket(payload) {
    const payloadLength = payload.length;
    const paddingLength = 16 + (-(payloadLength + 1) % 16) + 12;

    const packetLength = payloadLength + 1 + paddingLength;

    const packet_length = Buffer.alloc(4);
    packet_length.writeInt32BE(packetLength);

    const padding_length = Buffer.alloc(1);
    padding_length.writeInt8(paddingLength);

    const random_padding = crypto.randomBytes(paddingLength);

    const packet = Buffer.concat([packet_length, padding_length, payload, random_padding]);

    return packet;
}

function parsePacket(packet) {
    const packetLength = packet.readUInt32BE(0);
    const paddingLength = packet.readUInt8(4);
    const payload = packet.slice(5, 5 + packetLength - 1 - paddingLength);
    const padding = packet.slice(5 + packetLength - 1 - paddingLength, 5 + packetLength - 1);
    const remainder = packet.slice(5 + packetLength - 1);
    return { packetLength, paddingLength, payload, padding, remainder };
}

function writeKeyExchange() {
    const SSH_MSG_KEXINIT = Buffer.from("\x14");
    const cookie = crypto.randomBytes(16);
    const kex_algorithms = Buffer.from("ecdh-sha2-nistp256");
    const server_host_key_algos = Buffer.from("ssh-rsa");
    const encryption_algorithms_client_to_server = Buffer.from("aes128-ctr");
    const encryption_algorithms_server_to_client = Buffer.from("aes128-ctr");
    const mac_algorithms_client_to_server = Buffer.from("hmac-sha2-256");
    const mac_algorithms_server_to_client = Buffer.from("hmac-sha2-256");
    const compression_algorithms_client_to_server = Buffer.from("none");
    const compression_algorithms_server_to_client = Buffer.from("none");
    const languages_client_to_server = Buffer.from("");
    const languages_server_to_client = Buffer.from("");
    const first_kex_packet_follows = Buffer.from("\x00");
    const extensionField = Buffer.alloc(4);
    extensionField.writeUInt32BE(0);

    const nameList = [
        kex_algorithms,
        server_host_key_algos,
        encryption_algorithms_client_to_server,
        encryption_algorithms_server_to_client,
        mac_algorithms_client_to_server,
        mac_algorithms_server_to_client,
        compression_algorithms_client_to_server,
        compression_algorithms_server_to_client,
        languages_client_to_server,
        languages_server_to_client
    ];

    const nameListLengths = nameList.map(field => {
        const lengthBuffer = Buffer.alloc(4);
        lengthBuffer.writeUInt32BE(field.length);
        return lengthBuffer;
    });

    const payloadArr = [];

    payloadArr.push(SSH_MSG_KEXINIT, cookie);

    for (let i = 0; i < nameList.length; i++) {
        payloadArr.push(nameListLengths[i]);
        payloadArr.push(nameList[i]);
    }
    payloadArr.push(first_kex_packet_follows, extensionField);

    const payload = Buffer.concat(payloadArr);

    return { packet: writePacket(payload), payload: payload };
}

function writeInitKexPacket() {
    const kex = crypto.createECDH("prime256v1");
    const pubkey = kex.generateKeys();

    const packetType = Buffer.from("\x1e"); // 30 as per https://tools.ietf.org/html/rfc5656

    const pubkeyLength = Buffer.alloc(4);
    pubkeyLength.writeUInt32BE(pubkey.length);

    const initKexPacket = Buffer.concat([packetType, pubkeyLength, pubkey]);

    return { initKexPacket: writePacket(initKexPacket), kex, pubkey };
}

function parseKeyExchange(buff) {
    const { packetLength, paddingLength, payload, padding } = parsePacket(buff);
    let posBuff = 0;

    const SSH_MSG_KEXINIT = payload.slice(posBuff, posBuff + 1).readUInt8(0); // Should be 20 as per https://tools.ietf.org/html/rfc4253#page-4
    posBuff += 1;

    const cookie = payload.slice(posBuff, posBuff + 16);
    posBuff += cookie.length;

    const name_lists = [
        { name: "kex_algorithms", parsed: undefined },
        { name: "server_host_key_algos", parsed: undefined },
        { name: "encryption_algorithms_client_to_server", parsed: undefined },
        { name: "encryption_algorithms_server_to_client", parsed: undefined },
        { name: "mac_algorithms_client_to_server", parsed: undefined },
        { name: "mac_algorithms_server_to_client", parsed: undefined },
        { name: "compression_algorithms_client_to_server", parsed: undefined },
        { name: "compression_algorithms_server_to_client", parsed: undefined },
        { name: "languages_client_to_server", parsed: undefined },
        { name: "languages_server_to_client", parsed: undefined }
    ];

    for (let nameList of name_lists) {
        const fieldLength = payload.slice(posBuff).readUInt32BE(0);
        nameList.parsed = payload.slice(posBuff + 4, posBuff + fieldLength + 4);
        posBuff += fieldLength + 4;
    }

    const first_kex_packet_follows = payload.slice(posBuff, posBuff + 1).readUInt8(0);
    posBuff += 1;

    const extensionField = payload.slice(posBuff).readUInt32BE(0);
    posBuff += 4;

    const parsedPacket = { packetLength, paddingLength, SSH_MSG_KEXINIT, cookie };
    name_lists.forEach(nameList => (parsedPacket[nameList.name] = nameList.parsed));
    parsedPacket["first_kex_packet_follows"] = first_kex_packet_follows !== 0;
    parsedPacket["extensionField"] = extensionField;
    parsedPacket["random_padding"] = padding;

    return { parsedPacket, payload };
}

function parseECKey(buff) {
    const { packetLength, paddingLength, payload, padding, remainder } = parsePacket(buff);

    let posBuff = 0;

    const SSH_MSG_KEX_ECDH_REPLY = payload.slice(posBuff, posBuff + 1).readUInt8(0); // Should be 31 as per https://tools.ietf.org/html/rfc5656
    posBuff += 1;

    const hostKeyLength = payload.slice(posBuff).readUInt32BE(0);
    posBuff += 4;

    const hostKey = payload.slice(posBuff, posBuff + hostKeyLength);
    posBuff += hostKeyLength;

    const ephPubKeyLength = payload.slice(posBuff).readUInt32BE(0);
    posBuff += 4;

    const ephPubKey = payload.slice(posBuff, posBuff + ephPubKeyLength);
    posBuff += ephPubKeyLength;

    const sigLength = payload.slice(posBuff).readUInt32BE(0);
    posBuff += 4;

    const sig = payload.slice(posBuff, posBuff + sigLength);
    posBuff += sigLength;

    const parsedPacket = {
        packetLength,
        paddingLength,
        SSH_MSG_KEX_ECDH_REPLY,
        hostKeyLength,
        hostKey,
        ephPubKey,
        sig,
        padding,
        remainder
    };

    return parsedPacket;
}

function computeExchangeHash(V_C, V_S, IC, I_S, K_S, Q_C, Q_S, K) {
    const buffArr = [];
    [V_C, V_S, IC, I_S, K_S].forEach(arg => {
        const lengthBuff = Buffer.alloc(4);
        lengthBuff.writeUInt32BE(arg.length);
        buffArr.push(lengthBuff);
        buffArr.push(arg);
    });
    [Q_C, Q_S, K].forEach(arg => {
        let buff;
        if (arg[0] & 0x80) {
            buff = Buffer.concat([Buffer.from("\x00"), arg]);
        } else {
            buff = arg;
        }
        const lengthBuff = Buffer.alloc(4);
        lengthBuff.writeUInt32BE(buff.length);
        buffArr.push(lengthBuff);
        buffArr.push(buff);
    });
    const hash = crypto.createHash("sha256");
    const hashBuff = Buffer.concat(buffArr);
    const exchangeHash = hash.update(hashBuff).digest();
    return exchangeHash;
}

function generateEncrypterDecrypter(secret, exchangeHash) {
    const iv = crypto
        .createHash("sha256")
        .update(secret)
        .update(exchangeHash)
        .update("A", "ascii")
        .update(exchangeHash)
        .digest()
        .slice(0, 16);
    const key = crypto
        .createHash("sha256")
        .update(secret)
        .update(exchangeHash)
        .update("C", "ascii")
        .update(exchangeHash)
        .digest()
        .slice(0, 16);

    const ivD = crypto
        .createHash("sha256")
        .update(secret)
        .update(exchangeHash)
        .update("B", "ascii")
        .update(exchangeHash)
        .digest()
        .slice(0, 16);
    const keyD = crypto
        .createHash("sha256")
        .update(secret)
        .update(exchangeHash)
        .update("D", "ascii")
        .update(exchangeHash)
        .digest()
        .slice(0, 16);

    const hmacKey = crypto
        .createHash("sha256")
        .update(secret)
        .update(exchangeHash)
        .update("E", "ascii")
        .update(exchangeHash)
        .digest()
        .slice(0, 32);

    const cipher = crypto.createCipheriv("aes-128-ctr", key, iv);
    cipher.setAutoPadding(false);
    const decipher = crypto.createDecipheriv("aes-128-ctr", keyD, ivD);
    decipher.setAutoPadding(false);
    const encrypter = { iv, key, cipher };
    const decrypter = { iv, key, decipher };
    const hmac = { hmacKey };
    return { encrypter, hmac, decrypter };
}

function encryptAddHmac(packet, encrypter, payload, hmacKey, step) {
    const { packetLength, paddingLength } = parsePacket(packet);
    const encPacket = encrypter.cipher.update(packet);

    // need packetLength + 4 to be multiple of 16
    let mac;

    mac = crypto.createHmac("sha256", hmacKey);

    const stepBuff = Buffer.alloc(4);
    stepBuff.writeUInt32BE(step);

    const payloadLenBuff = Buffer.alloc(4);
    payloadLenBuff.writeUInt32BE(packetLength);

    const paddingLenBuff = Buffer.alloc(1);
    paddingLenBuff.writeInt8(paddingLength);

    console.log("hmac");
    console.log(
        stepBuff.toString("hex") +
            payloadLenBuff.toString("hex") +
            paddingLenBuff.toString("hex") +
            payload.toString("hex") +
            packet.slice(packet.length - paddingLength).toString("hex")
    );

    mac.update(Buffer.concat([stepBuff, payloadLenBuff, paddingLenBuff]));
    mac.update(Buffer.concat([payload, packet.slice(packet.length - paddingLength)]));
    mac = mac.digest().slice(0, 32);

    return Buffer.concat([encPacket, mac]);
}

module.exports = {
    writePacket,
    writeKeyExchange,
    parseKeyExchange,
    parseECKey,
    writeInitKexPacket,
    computeExchangeHash,
    generateEncrypterDecrypter,
    parsePacket,
    encryptAddHmac
};
