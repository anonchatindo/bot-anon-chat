const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');

const bot = new Telegraf(process.env.BOT_TOKEN);
const client = new MongoClient(process.env.MONGO_URI);

// Biarkan koneksi database di luar handler utama agar tidak terus-menerus reconnnect
let db = null;

async function connectDB() {
    if (!db) {
        await client.connect();
        db = client.db('anonchat').collection('users');
    }
    return db;
}

// Handler utama yang dipanggil oleh Vercel
module.exports = async (req, res) => {
    // Pastikan hanya memproses request POST dari Telegram Webhook
    if (req.method !== 'POST') {
        return res.status(200).send('Bot Anon Chat Berjalan via Webhook Vercel.');
    }

    try {
        const usersCollection = await connectDB();

        // Daftarkan ulang command bot di sini
        bot.command('start', (ctx) => ctx.reply("Halo! Ketik /search untuk cari teman chat acak."));
        
        bot.command('search', async (ctx) => {
            let user = await usersCollection.findOne({ _id: ctx.chat.id });
            if (user && user.partner) return ctx.reply("Kamu masih dalam obrolan!");
            
            let freePartner = await usersCollection.findOne({ searching: true, _id: { $ne: ctx.chat.id } });
            
            if (freePartner) {
                await usersCollection.updateOne({ _id: ctx.chat.id }, { $set: { partner: freePartner._id, searching: false } }, { upsert: true });
                await usersCollection.updateOne({ _id: freePartner._id }, { $set: { partner: ctx.chat.id, searching: false } });
                await bot.telegram.sendMessage(ctx.chat.id, "Pasangan ditemukan!");
                await bot.telegram.sendMessage(freePartner._id, "Pasangan ditemukan!");
            } else {
                await usersCollection.updateOne({ _id: ctx.chat.id }, { $set: { searching: true } }, { upsert: true });
                ctx.reply("Mencari pasangan...");
            }
        });

        bot.on('message', async (ctx) => {
            let user = await usersCollection.findOne({ _id: ctx.chat.id });
            if (user && user.partner) {
                await bot.telegram.copyMessage(user.partner, ctx.chat.id, ctx.message.message_id);
            }
        });

        // Proses update dari Telegram secara asinkron
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');

    } catch (err) {
        console.error("Error di Serverless:", err);
        // Tetap kirim status 200 ke Telegram agar Telegram tidak melakukan spam retrying jika ada error database
        res.status(200).send('Error handled');
    }
};
