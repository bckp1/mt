const { createRenewUDPlugin } = require('../lib/renewBaseUDP');

module.exports = createRenewUDPlugin({
  name: 'renewudp',
  aliases: ['renew-udp'],
  title: 'Perpanjang Akun ZIVPN',
  commandTpl: '/usr/local/sbin/bot-extudp {USER} {EXP}',
  expMode: 'days',
  marker: 'UDP'
});
