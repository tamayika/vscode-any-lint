export function escapeRegexp(source: string): string {
    return source.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

export function byteBasedToCharacterBased(text: string, offset: number): number {
    let sum = 0;
    for (let i = 0; i < text.length; i++) {
        const byteLength = Buffer.byteLength(text.substr(i, 1));
        sum += byteLength;
        if (offset < sum) {
            return i;
        }
    }
    return text.length;
}
