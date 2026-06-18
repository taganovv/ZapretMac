'use strict';

const fs = require('fs');

function isMachOBinary(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return false;
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    const magic = buf.readUInt32BE(0);
    return magic === 0xFEEDFACE || magic === 0xFEEDFACF || magic === 0xCAFEBABE || magic === 0xBEBAFECA;
  } catch {
    return false;
  }
}

module.exports = { isMachOBinary };
