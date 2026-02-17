const { createAddUdpPlugin } = require('../lib/addBaseUDP');

module.exports = createAddUdpPlugin({
  name: 'addudp',
  title: 'Tambah Akun UDP ZiVPN',
  commandTpl: '/usr/local/sbin/bot-addudp {USER} {DAYS}'
});
