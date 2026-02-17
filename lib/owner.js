
const OWNERS = ['2118266757'];

function parseOwnerIds() {
  return OWNERS.slice();
}

function isOwnerMsg(msgOrQuery) {
  const uid = String(msgOrQuery?.from?.id ?? '');
  return parseOwnerIds().includes(uid);
}

module.exports = { parseOwnerIds, isOwnerMsg };
