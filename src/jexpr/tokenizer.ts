/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/naming-convention */
/*
 * @license
 * Portions Copyright (c) 2013, the Dart project authors.
 */

import {KEYWORDS, POSTFIX_PRECEDENCE, PRECEDENCE} from './constants.js';

const _TWO_CHAR_OPS = ['==', '!=', '<=', '>=', '||', '&&', '??', '|>'];
const _THREE_CHAR_OPS = ['===', '!=='];

export interface Token {
  kind: Kind;
  value: string;
  precedence: number;
}

export enum Kind {
  STRING = 1,
  IDENTIFIER = 2,
  DOT = 3,
  COMMA = 4,
  COLON = 5,
  INTEGER = 6,
  DECIMAL = 7,
  OPERATOR = 8,
  GROUPER = 9,
  KEYWORD = 10,
}

export const token = (kind: Kind, value: string, precedence = 0) => ({
  kind,
  value,
  precedence,
});

const _isWhitespace = (ch: number) =>
  ch === 9 /* \t */ ||
  ch === 10 /* \n */ ||
  ch === 13 /* \r */ ||
  ch === 32; /* space */

// TODO(justinfagnani): allow code points > 127
const _isIdentOrKeywordStart = (ch: number) =>
  ch === 95 /* _ */ ||
  ch === 36 /* $ */ ||
  // ch &= ~32 puts ch into the range [65,90] [A-Z] only if ch was already in
  // the that range or in the range [97,122] [a-z]. We must mutate ch only after
  // checking other characters, thus the comma operator.
  ((ch &= ~32), 65 /* A */ <= ch && ch <= 90); /* Z */

// TODO(justinfagnani): allow code points > 127
const _isIdentifier = (ch: number) =>
  _isIdentOrKeywordStart(ch) || _isNumber(ch);

const _isKeyword = (str: string) => KEYWORDS.indexOf(str) !== -1;

const _isQuote = (ch: number) => ch === 34 /* " */ || ch === 39; /* ' */

const _isNumber = (ch: number) => 48 /* 0 */ <= ch && ch <= 57; /* 9 */

const _isOperator = (ch: number) =>
  ch === 43 /* + */ ||
  ch === 45 /* - */ ||
  ch === 42 /* * */ ||
  ch === 47 /* / */ ||
  ch === 33 /* ! */ ||
  ch === 38 /* & */ ||
  ch === 37 /* % */ ||
  ch === 60 /* < */ ||
  ch === 61 /* = */ ||
  ch === 62 /* > */ ||
  ch === 63 /* ? */ ||
  ch === 94 /* ^ */ ||
  ch === 124; /* | */

const _isGrouper = (ch: number) =>
  ch === 40 /* ( */ ||
  ch === 41 /* ) */ ||
  ch === 91 /* [ */ ||
  ch === 93 /* ] */ ||
  ch === 123 /* { */ ||
  ch === 125; /* } */

const _escapeString = (str: string) =>
  str.replace(/\\(.)/g, (_match, group) => {
    switch (group) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      default:
        return group;
    }
  });

export class Tokenizer {
  private _input: string;
  private _index = -1;
  private _tokenStart = 0;
  private _next?: number;

  constructor(input: string) {
    this._input = input;
    this._advance();
  }

  nextToken() {
    while (_isWhitespace(this._next!)) {
      this._advance(true);
    }
    if (_isQuote(this._next!)) {return this._tokenizeString();}
    if (_isIdentOrKeywordStart(this._next!)) {
      return this._tokenizeIdentOrKeyword();
    }
    if (_isNumber(this._next!)) {return this._tokenizeNumber();}
    if (this._next === 46 /* . */) {return this._tokenizeDot();}
    if (this._next === 44 /* , */) {return this._tokenizeComma();}
    if (this._next === 58 /* : */) {return this._tokenizeColon();}
    if (_isOperator(this._next!)) {return this._tokenizeOperator();}
    if (_isGrouper(this._next!)) {return this._tokenizeGrouper();}
    // no match, should be end of input
    this._advance();
    if (this._next !== undefined) {
      throw new Error(`Expected end of input, got ${this._next}`);
    }
    return undefined;
  }

  private _advance(resetTokenStart?: boolean) {
    this._index++;
    if (this._index < this._input.length) {
      this._next = this._input.charCodeAt(this._index);
      if (resetTokenStart === true) {
        this._tokenStart = this._index;
      }
    } else {
      this._next = undefined;
    }
  }

  private _getValue(lookahead = 0) {
    const v = this._input.substring(this._tokenStart, this._index + lookahead);
    if (lookahead === 0) {
      this._clearValue();
    }
    return v;
  }

  private _clearValue() {
    this._tokenStart = this._index;
  }

  private _tokenizeString() {
    const _us = 'unterminated string';
    const quoteChar = this._next;
    this._advance(true);
    while (this._next !== quoteChar) {
      if (this._next === undefined) {throw new Error(_us);}
      if (this._next === 92 /* \ */) {
        this._advance();
        if (this._next === undefined) {throw new Error(_us);}
      }
      this._advance();
    }
    const t = token(Kind.STRING, _escapeString(this._getValue()));
    this._advance();
    return t;
  }

  private _tokenizeIdentOrKeyword() {
    // This do/while loops assumes _isIdentifier(this._next!), so it must only
    // be called if _isIdentOrKeywordStart(this._next!) has returned true.
    do {
      this._advance();
    } while (_isIdentifier(this._next!));
    const value = this._getValue();
    const kind = _isKeyword(value) ? Kind.KEYWORD : Kind.IDENTIFIER;
    return token(kind, value);
  }

  private _tokenizeNumber() {
    // This do/while loops assumes _isNumber(this._next!), so it must only
    // be called if _isNumber(this._next!) has returned true.
    do {
      this._advance();
    } while (_isNumber(this._next!));
    if (this._next === 46 /* . */) {return this._tokenizeDot();}
    return token(Kind.INTEGER, this._getValue());
  }

  private _tokenizeDot() {
    this._advance();
    if (_isNumber(this._next!)) {return this._tokenizeFraction();}
    this._clearValue();
    return token(Kind.DOT, '.', POSTFIX_PRECEDENCE);
  }

  private _tokenizeComma() {
    this._advance(true);
    return token(Kind.COMMA, ',');
  }

  private _tokenizeColon() {
    this._advance(true);
    return token(Kind.COLON, ':');
  }

  private _tokenizeFraction() {
    // This do/while loops assumes _isNumber(this._next!), so it must only
    // be called if _isNumber(this._next!) has returned true.
    do {
      this._advance();
    } while (_isNumber(this._next!));
    return token(Kind.DECIMAL, this._getValue());
  }

  private _tokenizeOperator() {
    this._advance();
    let op = this._getValue(2);

    if (_THREE_CHAR_OPS.indexOf(op) !== -1) {
      this._advance();
      this._advance();
    } else {
      op = this._getValue(1);
      if (_TWO_CHAR_OPS.indexOf(op) !== -1) {
        this._advance();
      }
    }
    op = this._getValue();
    return token(Kind.OPERATOR, op, PRECEDENCE[op]);
  }

  private _tokenizeGrouper() {
    const value = String.fromCharCode(this._next!);
    const t = token(Kind.GROUPER, value, PRECEDENCE[value]);
    this._advance(true);
    return t;
  }
}
