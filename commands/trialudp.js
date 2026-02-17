const { createTrialPlugin } = require('../lib/trialBase');

module.exports = createTrialPlugin({
  name: 'trialudp',
  aliases: ['trial-udp'],
  title: 'Trial UDP ZIVPN',
  commandTpl: '/usr/local/sbin/bot-trialudp {MIN}', // {MIN} = durasi trial
  minutes: 60 // default 60 menit trial, bisa diubah
});
