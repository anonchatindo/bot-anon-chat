const { Telegraf, Markup } = require('telegraf');
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

// 1. START: Registrasi Profil User Sendiri
bot.command('start', async (ctx) => {
    try {
        const usersCollection = await connectDB();
        await usersCollection.updateOne(
            { _id: ctx.chat.id },
            { $set: { searching: false, partner: null, targetGender: null } },
            { upsert: true }
        );

        await ctx.reply(
            "Selamat datang di Anon Chat! Sebelum mulai, yuk isi profil asli kamu dulu.\n\nGender asli kamu apa?",
            Markup.inlineKeyboard([
                [Markup.button.callback('♂️ Aku Cowok', 'set_mygender_cowok')],
                [Markup.button.callback('♀️ Aku Cewek', 'set_mygender_cewek')]
            ])
        );
    } catch (err) {
        console.error(err);
    }
});

// 2. RESPONSE GENDER ASLI -> PILIH USIA ASLI
bot.action(/set_mygender_(.+)/, async (ctx) => {
    try {
        const gender = ctx.match[1];
        const usersCollection = await connectDB();
        await usersCollection.updateOne({ _id: ctx.chat.id }, { $set: { gender: gender } });

        await ctx.answerCbQuery();
        await ctx.editMessageText(
            `Profil disimpan: ${gender === 'cowok' ? '♂️ Cowok' : '♀️ Cewek'}.\n\nSekarang, pilih kelompok usia kamu saat ini:`,
            Markup.inlineKeyboard([
                [Markup.button.callback('🔹 17-18 thn', 'set_myage_17-18'), Markup.button.callback('🔹 19-20 thn', 'set_myage_19-20')],
                [Markup.button.callback('🔹 21-22 thn', 'set_myage_21-22'), Markup.button.callback('🔹 23-24 thn', 'set_myage_23-24')],
                [Markup.button.callback('🔹 25-26 thn', 'set_myage_25-26'), Markup.button.callback('🔹 27-28 thn', 'set_myage_27-28')],
                [Markup.button.callback('🔹 29-30 thn', 'set_myage_29-30'), Markup.button.callback('🔹 31-32 thn', 'set_myage_31-32')]
            ])
        );
    } catch (err) {
        console.error(err);
    }
});

// 3. RESPONSE USIA ASLI -> REGISTRASI SELESAI
bot.action(/set_myage_(.+)/, async (ctx) => {
    try {
        const ageGroup = ctx.match[1];
        const usersCollection = await connectDB();
        await usersCollection.updateOne({ _id: ctx.chat.id }, { $set: { age: ageGroup } });

        await ctx.answerCbQuery();
        await ctx.editMessageText(
            "🎉 Profil kamu sudah lengkap disimpan di database!\n\nSekarang ketik atau pencet perintah **`/search`** untuk memfilter siapa yang mau kamu cari hari ini!",
        );
    } catch (err) {
        console.error(err);
    }
});

// 4. COMMAND /SEARCH: Tanyakan Ingin Mencari Siapa (Filter Gender Target)
bot.command('search', async (ctx) => {
    try {
        const usersCollection = await connectDB();
        let user = await usersCollection.findOne({ _id: ctx.chat.id });
        
        if (!user || !user.gender || !user.age) {
            return ctx.reply("Kamu belum mengisi profil lengkap! Silakan ketik /start terlebih dahulu.");
        }

        if (user.partner) return ctx.reply("Kamu masih dalam obrolan aktif! Ketik /stop untuk menyudahi.");
        
        await ctx.reply(
            "Mau cari pasangan chat gender apa nih?",
            Markup.inlineKeyboard([
                [Markup.button.callback('🔍 Cari Cowok', 'find_target_cowok')],
                [Markup.button.callback('🔍 Cari Cewek', 'find_target_cewek')]
            ])
        );
    } catch (err) {
        console.error("Error search command:", err);
    }
});

// 5. ACTION SEARCHING: Cari Match Sesuai Target Gender & Rentang Usia Sama
bot.action(/find_target_(.+)/, async (ctx) => {
    try {
        const selectedTarget = ctx.match[1]; 
        const usersCollection = await connectDB();
        let user = await usersCollection.findOne({ _id: ctx.chat.id });

        await ctx.answerCbQuery();

        // 1. Update target pencarian user saat ini di database
        await usersCollection.updateOne({ _id: ctx.chat.id }, { $set: { targetGender: selectedTarget } });

        // 2. Cari partner di database yang memenuhi 4 SYARAT:
        //    - Dia sedang mencari (searching: true)
        //    - Gendernya cocok dengan yang dicari user saat ini (gender: selectedTarget)
        //    - Kategori usianya harus sama (age: user.age)
        //    - Target dia haruslah gender asli dari si user saat ini (targetGender: user.gender)
        let freePartner = await usersCollection.findOne({
            searching: true,
            gender: selectedTarget,
            age: user.age,
            targetGender: user.gender,
            _id: { $ne: ctx.chat.id }
        });

        if (freePartner) {
            // Berhasil jodoh, kunci status masing-masing
            await usersCollection.updateOne({ _id: ctx.chat.id }, { $set: { partner: freePartner._id, searching: false } });
            await usersCollection.updateOne({ _id: freePartner._id }, { $set: { partner: ctx.chat.id, searching: false } });
            
            await ctx.editMessageText("Pasangan ditemukan! Selamat mengobrol sepuasnya 🥳\n\nKetik /stop untuk berhenti.");
            await bot.telegram.sendMessage(freePartner._id, "Pasangan ditemukan! Selamat mengobrol sepuasnya 🥳\n\nKetik /stop untuk berhenti.");
        } else {
            // Jika belum ada yang cocok, masuk daftar antrean tunggu
            await usersCollection.updateOne({ _id: ctx.chat.id }, { $set: { searching: true } });
            await ctx.editMessageText(`Mencari pasangan (${selectedTarget === 'cowok' ? '♂️ Cowok' : '♀️ Cewek'}, Usia: ${user.age} thn)... mohon tunggu sebentar.`);
        }
    } catch (err) {
        console.error("Error matching action:", err);
    }
});

// 6. STOP OBROLAN
bot.command('stop', async (ctx) => {
    try {
        const usersCollection = await connectDB();
        let user = await usersCollection.findOne({ _id: ctx.chat.id });
        
        if (user && user.partner) {
            const partnerId = user.partner;
            await usersCollection.updateOne({ _id: ctx.chat.id }, { $set: { partner: null, searching: false, targetGender: null } });
            await usersCollection.updateOne({ _id: partnerId }, { $set: { partner: null, searching: false, targetGender: null } });
            
            await bot.telegram.sendMessage(ctx.chat.id, "Kamu telah menghentikan obrolan. Ketik /search lagi untuk mencari yang baru.");
            await bot.telegram.sendMessage(partnerId, "Pasanganmu telah menghentikan obrolan. Ketik /search lagi untuk mencari yang baru.");
        } else {
            await usersCollection.updateOne({ _id: ctx.chat.id }, { $set: { searching: false, targetGender: null } });
            ctx.reply("Pencarian dibatalkan atau kamu sedang tidak dalam obrolan.");
        }
    } catch (err) {
        console.error(err);
    }
});

// 7. OPER DATA PESAN CHAT
bot.on('message', async (ctx) => {
    try {
        const usersCollection = await connectDB();
        let user = await usersCollection.findOne({ _id: ctx.chat.id });
        if (user && user.partner) {
            await bot.telegram.copyMessage(user.partner, ctx.chat.id, ctx.message.message_id);
        }
    } catch (err) {
        console.error("Error pengiriman pesan:", err);
    }
});

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(200).send('Bot Anon Chat Berjalan via Webhook Vercel.');
    }
    try {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } catch (err) {
        console.error("Error Serverless Runtime:", err);
        res.status(200).send('Error Handled');
    }
};
