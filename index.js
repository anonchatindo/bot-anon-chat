const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');

const bot = new Telegraf(process.env.BOT_TOKEN);
const client = new MongoClient(process.env.MONGO_URI);

// Handler utama untuk Vercel Serverless
module.exports = async (req, res) => {
    try {
        // Hubungkan ke MongoDB jika belum terkoneksi
        if (!client.topology || !client.topology.isConnected()) {
            await client.connect();
        }
        
        const db = client.db('anonchat').collection('users');

        bot.command('start', (ctx) => ctx.reply("Halo! Ketik /search untuk cari teman chat acak."));
        
        bot.command('search', async (ctx) => {
            let user = await db.findOne({ _id: ctx.chat.id });
            if (user && user.partner) return ctx.reply("Kamu masih dalam obrolan!");
            
            let freePartner = await db.findOne({ searching: true, _id: { $ne: ctx.chat.id } });
            
            if (freePartner) {
                await db.updateOne({ _id: ctx.chat.id }, { $set: { partner: freePartner._id, searching: false } }, { upsert: true });
                await db.updateOne({ _id: freePartner._id }, { $set: { partner: ctx.chat.id, searching: false } });
                bot.telegram.sendMessage(ctx.chat.id, "Pasangan ditemukan!");
                bot.telegram.sendMessage(freePartner._id, "Pasangan ditemukan!");
            } else {
                await db.updateOne({ _id: ctx.chat.id }, { $set: { searching: true } }, { upsert: true });
                ctx.reply("Mencari pasangan...");
            }
        });

        bot.on('message', async (ctx) => {
            let user = await db.findOne({ _id: ctx.chat.id });
            if (user && user.partner) {
                bot.telegram.copyMessage(user.partner, ctx.chat.id, ctx.message.message_id);
            }
        });

        // Proses pesan yang masuk dari webhook Telegram
        if (req.method === 'POST') {
            await bot.handleUpdate(req.body);
            res.status(200).send('OK');
        } else {
            res.status(200).send('Bot Anon Chat is running via Webhook.');
        }

    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
};
