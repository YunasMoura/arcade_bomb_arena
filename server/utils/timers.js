'use strict';

function monotonicNow() {
  return Number(process.hrtime.bigint() / 1000000n);
}

const EPOCH_OFFSET = Date.now() - monotonicNow();
function serverTime() {
  return monotonicNow() + EPOCH_OFFSET;
}

module.exports = { monotonicNow, serverTime };
