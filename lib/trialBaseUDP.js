const { exec } = require("child_process");

function runTrial(script, username, duration) {
  return new Promise((resolve, reject) => {
    exec(`${script} ${username} ${duration}`, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout);
    });
  });
}

module.exports = { runTrial };
