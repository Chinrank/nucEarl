function parseArgs(args, argFlags) {
    const parsedArgs = {};
    let i = 0;
    while (i < args.length) {
        const { cmd, cmdArgs, isFlag } = parseCmd(args.slice(i), argFlags);
        if (parsedArgs.hasOwnProperty(cmd)) {
            parsedArgs[cmd].push(cmdArgs.slice(0, argFlags[cmd].maxLength));
        } else {
            parsedArgs[cmd] = [cmdArgs.slice(0, argFlags[cmd].maxLength)];
        }
        i = i + Math.min(cmdArgs.length, argFlags[cmd].maxLength) + (isFlag ? 1 : 0);
    }
    return tidyParsed(parsedArgs, argFlags);
}

function tidyMultiArgs(parsedArgs, argFlags) {
    const tidiedMultiParsedArgs = {};
    for (let flag of Object.keys(parsedArgs)) {
        tidiedMultiParsedArgs[flag] = argFlags[flag].multi ? parsedArgs[flag] : parsedArgs[flag][0];
    }
    return tidiedMultiParsedArgs;
}

function tidyShortArgs(parsedArgs, argFlags) {
    const tidiedShortParsedArgs = {};
    for (let flag of Object.keys(parsedArgs)) {
        if (argFlags[flag].maxLength === 1) {
            tidiedShortParsedArgs[flag] = parsedArgs[flag].map(args => args[0]);
        } else if (argFlags[flag].maxLength === 0) {
            tidiedShortParsedArgs[flag] = parsedArgs[flag].map(() => true);
        } else {
            tidiedShortParsedArgs[flag] = parsedArgs[flag];
        }
    }
    return tidiedShortParsedArgs;
}

function tidyParsed(parsedArgs, argFlags) {
    const tidyShort = tidyShortArgs(parsedArgs, argFlags);
    const tidyMulti = tidyMultiArgs(tidyShort, argFlags);
    return tidyMulti;
}

function parseCmd(args, argFlags) {
    const isFlag = argFlags.hasOwnProperty(args[0]);
    const cmd = isFlag ? args[0] : argFlags.defaultFlag.name;
    const cmdArgs = [];
    if (argFlags[cmd].minLength > args.length - (isFlag ? 1 : 0)) {
        throw new SyntaxError(
            `You have provided too few arguments for ${cmd}, it needs at least ${
                argFlags[cmd].minLength
            }`
        );
    }
    for (let i = isFlag ? 1 : 0; i <= Math.min(argFlags[cmd].maxLength, args.length - 1); i++) {
        if (argFlags.hasOwnProperty(args[i]) && argFlags[cmd].minLength > i - isFlag ? 1 : 0) {
            throw new SyntaxError(
                `You have provided too few arguments for ${cmd}, it needs at least ${
                    argFlags[cmd].minLength
                } but there was a flag ${args[i]} present at ${i} after this flag`
            );
        }
        if (argFlags.hasOwnProperty(args[i])) {
            break;
        }
        cmdArgs.push(args[i]);
    }

    return { cmd, cmdArgs, isFlag };
}

module.exports = parseArgs;
