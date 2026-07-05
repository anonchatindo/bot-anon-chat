const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');

const bot = new Telegraf(process.env.BOT_TOKEN);
const client = new MongoClient(process.env.MONGO_URI);

async function start() {
    await client.connect();
    const db = client.db('anonchat').collection('users');
    console.log("Database Terhubung!");
    
    bot.command('start', (ctx) => ctx.reply("Halo! Ketik /search untuk cari teman chat acak."));
    
    // Logika sederhana: Menunggu antrean
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

    bot.launch();
    console.log("Bot Berjalan!");
}
start();
