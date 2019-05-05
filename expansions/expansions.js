function flatMap(mapF, arr) {
    return arr.map(mapF).reduce((curr, prev) => curr.concat(prev), []);
}

function expandUriCurly(indUri) {
    const expandable = indUri.match(/(.*)(\{.*?\})(.*)/);
    if (!expandable) {
        return [indUri];
    }

    const remainder = expandable[3];
    const start = expandable[1];
    const matched = expandable[2]
        .slice(1, expandable[2].length - 1)
        .split(",")
        .map(exp => start + exp.trim() + remainder);
    const recurrMatch = flatMap(expandUriCurly, matched);

    return recurrMatch;
}

function expandUriSquareDigit(indUri) {
    const expandableDig = indUri.match(/(.*)\[(\d)+-(\d+)\](.*)/);
    const expandableDigColon = !expandableDig
        ? indUri.match(/(.*)\[(\d)+-(\d+):(\d+)\](.*)/)
        : undefined;

    if (!expandableDig && !expandableDigColon) {
        return [indUri];
    }
    const expandable = expandableDig || expandableDigColon;

    const remainder = expandable[expandableDigColon ? 5 : 4];
    const start = expandable[1];
    const startIndex = Number(expandable[2]);
    const endIndex = Number(expandable[3]);
    const step = Number(expandableDigColon ? expandable[4] : 1);
    const matched = Array(Math.ceil((endIndex - startIndex + 1) / step))
        .fill(0)
        .map((_, i) => start + (startIndex + i * step) + remainder);

    const recurrMatch = flatMap(expandUriSquareDigit, matched);

    return recurrMatch;
}

function expandUriSquareAlpha(indUri) {
    const expandableAlpha = indUri.match(/(.*)\[([a-zA-Z])-([a-zA-Z])\](.*)/);
    const expandableAlphaColon = !expandableAlpha
        ? indUri.match(/(.*)\[([a-zA-Z])-([a-zA-Z]):(\d+)\](.*)/)
        : undefined;

    if (!expandableAlpha && !expandableAlphaColon) {
        return [indUri];
    }
    const expandable = expandableAlpha || expandableAlphaColon;

    const remainder = expandable[expandableAlphaColon ? 5 : 4];
    const start = expandable[1];
    const startChar = expandable[2].charCodeAt(0);
    const endChar = expandable[3].charCodeAt(0);
    const step = Number(expandableAlphaColon ? expandable[4] : 1);
    const matched = Array(Math.ceil((endChar - startChar + 1) / step))
        .fill(0)
        .map((_, i) => start + String.fromCharCode(startChar + i * step) + remainder);

    const recurrMatch = flatMap(expandUriSquareAlpha, matched);

    return recurrMatch;
}

function applyExpansions(uriArr) {
    return flatMap(
        expandUriSquareAlpha,
        flatMap(expandUriSquareDigit, flatMap(expandUriCurly, uriArr))
    );
}

module.exports = applyExpansions;
