require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');
const Database = require('better-sqlite3');
const { logPurchase } = require('../lib/db');

// ===== database =====
const DB_PATH = path.resolve(process.cwd(), 'sanz', 'wallet.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const stmtGetUser = db.prepare(`SELECT tg_id,name,balance FROM users WHERE tg_id=?`);
const stmtAddBalance = db.prepare(`UPDATE users SET balance = balance + ? WHERE tg_id=?`);

// ===== utils =====
const skey   = (msg) => `${msg.chat.id}:${msg.from.id}`;
const textOf = (msg) => String(msg.text || msg.caption || '').trim();
const send   = (bot,id,text,opt={}) =>
  bot.sendMessage(id,text,{parse_mode:'Markdown',...opt});
const idr = n => Number(n||0).toLocaleString('id-ID');

function stripAnsi(s=''){ return s.replace(/\x1b\[[0-9;]*m/g,''); }

// ===== VPS LIST =====
function loadVpsList() {
  const p = path.resolve(process.cwd(), 'sanz', 'vps.json');
  if (!fs.existsSync(p)) throw new Error('File VPS tidak ditemukan');
  const data = JSON.parse(fs.readFileSync(p,'utf8'));
  if (!Array.isArray(data) || !data.length) throw new Error('VPS kosong');
  return data;
}

// ===== inline picker VPS =====
async function promptPickVpsInline(bot,msg,title,prefix){
  const list = loadVpsList();
  const kb = [];
  let text = '📋 *List Server*\n\n';

  for(const v of list){
    const id = v.id || v.host;
    const harga = Number(v.harga_per_hari || 0);

    text +=
`┏━ 🚀 *${id}*
┃ 💰 Harga / hari : Rp${harga.toLocaleString()}
┗━━━━━━━━━━━━━━\n\n`;

    kb.push([{
      text: `${id} • Rp${harga}/hari`,
      callback_data: `${prefix}:pick:${id}`
    }]);
  }

  kb.push([{ text:'❌ Batal', callback_data:`${prefix}:batal` }]);

  await bot.sendMessage(msg.chat.id,`${title}\n\n${text}Pilih server:`,{
    parse_mode:'Markdown',
    reply_markup:{ inline_keyboard: kb }
  });

  return list;
}

// ===== SSH runner =====
function sshRun(vps,cmd){
  return new Promise(resolve=>{
    const conn=new Client();
    let out='',err='';
    conn.on('ready',()=>{
      conn.exec(cmd,(e,st)=>{
        if(e) return resolve({ok:false,reason:e.message});
        st.on('data',d=>out+=d);
        st.stderr.on('data',d=>err+=d);
        st.on('close',code=>{
          conn.end();
          resolve({
            ok: code===0,
            output: stripAnsi(out+err)
          });
        });
      });
    });
    conn.on('error',e=>resolve({ok:false,reason:e.message}));
    conn.connect({
      host: vps.host,
      port: vps.port||22,
      username: vps.username,
      password: vps.password
    });
  });
}

// ======================================================
// CREATE ADD UDP PLUGIN
// ======================================================
function createAddUdpPlugin({ name, title, commandTpl }) {
  global.__addudp_sessions ??= Object.create(null);

  async function start(bot,msg){
    const key=`${name}:${skey(msg)}`;
    let vpsList;

    try{
      vpsList = await promptPickVpsInline(bot,msg,`*${title}*`,name);
    }catch(e){
      return send(bot,msg.chat.id,`❌ ${e.message}`);
    }

    global.__addudp_sessions[key]={ step:1, vpsList };

    setTimeout(()=>{
      if(global.__addudp_sessions[key]){
        delete global.__addudp_sessions[key];
        send(bot,msg.chat.id,'⏳ Sesi expired').catch(()=>{});
      }
    },60_000);
  }

  async function cont(bot,msg){
    const key=`${name}:${skey(msg)}`;
    const S=global.__addudp_sessions[key];
    if(!S) return false;

    const t=textOf(msg);

    if(/^([./])?batal$/i.test(t)){
      delete global.__addudp_sessions[key];
      await send(bot,msg.chat.id,'✅ Dibatalkan');
      return true;
    }

    // STEP 2: username
    if(S.step===2){
      if(!/^[a-zA-Z0-9_.-]{3,32}$/.test(t)){
        await send(bot,msg.chat.id,'⚠️ Username tidak valid');
        return true;
      }
      S.user=t;
      S.step=3;
      await send(bot,msg.chat.id,'⏳ Masukkan *masa aktif* (hari):');
      return true;
    }

    // STEP 3: days
    if(S.step===3){
      const days=parseInt(t,10);
      if(!days||days<1||days>3650){
        await send(bot,msg.chat.id,'⚠️ Hari tidak valid');
        return true;
      }

      const harga = Number(S.vps?.harga_per_hari||0);
      const cost = days*harga;

      const u = stmtGetUser.get(String(msg.from.id));
      if(!u||u.balance<cost){
        await send(bot,msg.chat.id,
          `💸 Saldo tidak cukup\nHarga: Rp${idr(cost)}\nSaldo: Rp${idr(u?.balance||0)}`
        );
        delete global.__addudp_sessions[key];
        return true;
      }

      const cmd = commandTpl
        .replace('{USER}',S.user)
        .replace('{DAYS}',days);

      await send(bot,msg.chat.id,
        `⏳ Membuat UDP di *${S.vps.id||S.vps.host}*\n`+
        `• User: ${S.user}\n• ${days} hari\n• Rp${idr(cost)}`
      );

      const res=await sshRun(S.vps,cmd);
      if(!res.ok){
        await send(bot,msg.chat.id,'❌ Gagal membuat akun UDP');
        delete global.__addudp_sessions[key];
        return true;
      }

      db.transaction(()=>stmtAddBalance.run(-cost,String(msg.from.id)))();
      delete global.__addudp_sessions[key];

      await send(bot,msg.chat.id,`✅ *UDP ZiVPN berhasil dibuat*\n\n${res.output}`);
      logPurchase({ tg_id:msg.from.id, kind:'udp', days, vps_id:S.vps.id });

      return true;
    }

    return true;
  }

  // ===== callback picker =====
  function attachCallback(bot){
    bot.on('callback_query',async q=>{
      const data=q.data;
      const chatId=q.message.chat.id;

      if(data===`${name}:batal`){
        delete global.__addudp_sessions[`${name}:${chatId}:${q.from.id}`];
        await bot.editMessageText('❌ Dibatalkan',{
          chat_id:chatId,
          message_id:q.message.message_id
        });
        return;
      }

      if(!data.startsWith(`${name}:pick:`)) return;

      const key=`${name}:${chatId}:${q.from.id}`;
      const S=global.__addudp_sessions[key];
      if(!S) return;

      const id=data.split(':')[2];
      const picked=S.vpsList.find(v=>(v.id||v.host)===id);
      if(!picked) return;

      S.vps=picked;
      S.step=2;

      await bot.editMessageText(
        `✅ VPS dipilih: *${id}*\n\n👤 Masukkan *username UDP*:`,
        {
          chat_id:chatId,
          message_id:q.message.message_id,
          parse_mode:'Markdown'
        }
      );
    });
  }

  return {
    name,
    description: title,
    async execute(bot,msg){
      attachCallback(bot);
      return start(bot,msg);
    },
    async continue(bot,msg){ return cont(bot,msg); }
  };
}

module.exports = { createAddUdpPlugin };
