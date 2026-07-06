const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');

const bot = new Telegraf(process.env.BOT_TOKEN);
const client = new MongoClient(process.env.MONGO_URI);

let db = null;

async function connectDB() {
    if (!db) {
        await client.connect();
        db = client.db('anonchat').collection('users');
    }
    return db;
}

// Handler perintah bot
bot.command('start', (ctx) => ctx.reply("Halo! Ketik /search untuk cari teman chat acak."));

bot.command('search', async (ctx) => {
    try {
        const usersCollection = await connectDB();
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
            await ctx.reply("Mencari pasangan...");
        }
    } catch (err) {
        console.error("Error search:", err);
    }
});

bot.on('message', async (ctx) => {
    try {
        const usersCollection = await connectDB();
        let user = await usersCollection.findOne({ _id: ctx.chat.id });
        if (user && user.partner) {
            await bot.telegram.copyMessage(user.partner, ctx.chat.id, ctx.message.message_id);
        }
    } catch (err) {
        console.error("Error message forwarding:", err);
    }
});

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(200).send('Bot Anon Chat Berjalan via Webhook Vercel.');
    }

    try {
        // Trik Serverless: Tunggu sampai seluruh proses bot (database + kirim pesan) selesai total
        await bot.handleUpdate(req.body);
        // Setelah selesai, baru kirim sinyal OK ke Telegram
        res.status(200).send('OK');
    } catch (err) {
        console.error("Error di Serverless Runtime:", err);
        // Tetap kirim 200 agar Telegram tidak melakukan retry massal saat terjadi error
        res.status(200).send('Error Handled');
    }
};
