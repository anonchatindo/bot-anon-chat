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

// Teks navigasi yang akan muncul saat match ditemukan atau saat obrolan berhenti
const infoTeksNavigasi = "\n\n📌 **Navigasi Chat:**\n• Ketik /next - cari orang baru (filter sama)\n• Ketik /new - cari pakai filter baru\n• Ketik /stop - berhenti mengobrol";

// Fungsi pembantu untuk mencocokkan user berdasarkan filter yang sudah disimpan
async function matchUser(ctx, usersCollection, user) {
    let freePartner = await usersCollection.findOne({
        searching: true,
        gender: user.targetGender,
        age: user.targetAge,
        targetGender: user.gender,
        targetAge: user.age,
        _id: { $ne: ctx.chat.id }
    });

    if (freePartner) {
        await usersCollection.updateOne({ _id: ctx.chat.id }, { $set: { partner: freePartner._id, searching: false } });
        await usersCollection.updateOne({ _id: freePartner._id }, { $set: { partner: ctx.chat.id, searching: false } });
        
        await bot.telegram.sendMessage(ctx.chat.id, "🎉 **Pasangan ditemukan! Selamat mengobrol!**" + infoTeksNavigasi, { parse_mode: 'Markdown' });
        await bot.telegram.sendMessage(freePartner._id, "🎉 **Pasangan ditemukan! Selamat mengobrol!**" + infoTeksNavigasi, { parse_mode: 'Markdown' });
        return true;
    } else {
        await usersCollection.updateOne({ _id: ctx.chat.id }, { $set: { searching: true } });
        return false;
    }
}

// 1. START: Registrasi Profil Diri Sendiri
bot.command('start', async (ctx) => {
    try {
        const usersCollection = await connectDB();
        await usersCollection.updateOne(
            { _id: ctx.chat.id },
            { $set: { searching: false, partner: null, targetGender: null, targetAge: null } },
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

bot.action(/set_myage_(.+)/, async (ctx) => {
    try {
        const ageGroup = ctx.match[1];
        const usersCollection = await connectDB();
        await usersCollection.updateOne({ _id: ctx.chat.id }, { $set: { age: ageGroup } });

        await ctx.answerCbQuery();
        await ctx.editMessageText(
            "🎉 Profil kamu berhasil disimpan!\n\nSekarang ketik **`/search`** untuk mengatur filter pasangan yang ingin kamu cari.",
        );
    } catch (err) {
        console.error(err);
    }
});

// 2. SEARCH: Langkah 1 - Pilih Gender Target
bot.command('search', async (ctx) => {
    try {
        const usersCollection = await connectDB();
        let user = await usersCollection.findOne({ _id: ctx.chat.id });
        
        if (!user || !user.gender || !user.age) {
            return ctx.reply("Kamu belum mengisi profil lengkap! Silakan ketik /start terlebih dahulu.");
        }

        if (user.partner) return ctx.reply("Kamu masih dalam obrolan aktif! Ketik /stop atau /next.");
        
        await ctx.reply(
            "Filter Pencarian - Langkah 1/2:\nMau cari pasangan chat gender apa?",
            Markup.inlineKeyboard([
                [Markup.button.callback('♂️ Cari Cowok', 'find_gender_cowok')],
                [Markup.button.callback('♀️ Cari Cewek', 'find_gender_cewek')]
            ])
        );
    } catch (err) {
        console.error("Error search command:", err);
    }
});

// 3. SEARCH: Langkah 2 - Pilih Usia Target
bot.action(/find_gender_(.+)/, async (ctx) => {
    try {
        const selectedGender = ctx.match[1]; 
        const usersCollection = await connectDB();
        
        await usersCollection.updateOne({ _id: ctx.chat.id }, { $set: { targetGender: selectedGender } });
        await ctx.answerCbQuery();

        await ctx.editMessageText(
            `Filter Pencarian - Langkah 2/2:\nTarget Gender: ${selectedGender === 'cowok' ? '♂️ Cowok' : '♀️ Cewek'}\n\nSekarang, pilih kriteria usia pasangan yang kamu inginkan:`,
            Markup.inlineKeyboard([
                [Markup.button.callback('🔹 17-18 thn', 'find_age_17-18'), Markup.button.callback('🔹 19-20 thn', 'find_age_19-20')],
                [Markup.button.callback('🔹 21-22 thn', 'find_age_21-22'), Markup.button.callback('🔹 23-24 thn', 'find_age_23-24')],
                [Markup.button.callback('🔹 25-26 thn', 'find_age_25-26'), Markup.button.callback('🔹 27-28 thn', 'find_age_27-28')],
                [Markup.button.callback('🔹 29-30 thn', 'find_age_29-30'), Markup.button.callback('🔹 31-32 thn', 'find_age_31-32')]
            ])
        );
    } catch (err) {
        console.error(err);
    }
});

// 4. ACTION MATCHING UTAMA
bot.action(/find_age_(.+)/, async (ctx) => {
    try {
        const selectedAge = ctx.match[1];
        const usersCollection = await connectDB();
        await ctx.answerCbQuery();

        let user = await usersCollection.findOneAndUpdate(
            { _id: ctx.chat.id },
            { $set: { targetAge: selectedAge } },
            { returnDocument: 'after' }
        );

        if (user.value) user = user.value; 
        else if (!user.gender) user = await usersCollection.findOne({ _id: ctx.chat.id });

        const isMatched = await matchUser(ctx, usersCollection, user);
        
        if (isMatched) {
            await ctx.deleteMessage();
        } else {
            await ctx.editMessageText(
                `🕵️‍♂️ **Mencari pasangan...**\n🎯 Kriteria: ${user.targetGender === 'cowok' ? '♂️ Cowok' : '♀️ Cewek'} (Usia ${selectedAge} thn)\n\nMohon tunggu sampai ada yang cocok.`
            );
        }
    } catch (err) {
        console.error("Error matching action:", err);
    }
});

// 5. COMMAND /NEXT (Cari Orang Baru dengan Kriteria Sama)
bot.command('next', async (ctx) => {
    try {
        const usersCollection = await connectDB();
        let user = await usersCollection.findOne({ _id: ctx.chat.id });

        if (!user || !user.targetGender || !user.targetAge) {
            return ctx.reply("Kamu belum mengatur filter pencarian! Ketik /search terlebih dahulu.");
        }

        // Putuskan hubungan dengan pasangan lama jika ada
        if (user.partner) {
            const partnerId = user.partner;
            await usersCollection.updateOne({ _id: partnerId }, { $set: { partner: null, searching: false } });
            await bot.telegram.sendMessage(partnerId, "💔 **Obrolan kamu telah dihentikan oleh pasanganmu.**" + infoTeksNavigasi, { parse_mode: 'Markdown' });
        }

        // Set status user menjadi mencari kembali
        await usersCollection.updateOne({ _id: ctx.chat.id }, { $set: { partner: null, searching: true } });
        await ctx.reply(`🔄 Mencari pasangan baru dengan kriteria tetap (${user.targetGender === 'cowok' ? '♂️ Cowok' : '♀️ Cewek'}, ${user.targetAge} thn)...`);
        
        // Jalankan pencarian ulang otomatis
        await matchUser(ctx, usersCollection, user);
    } catch (err) {
        console.error(err);
    }
});

// 6. COMMAND /NEW (Ganti Filter Baru)
bot.command('new', async (ctx) => {
    try {
        const usersCollection = await connectDB();
        let user = await usersCollection.findOne({ _id: ctx.chat.id });

        if (user && user.partner) {
            const partnerId = user.partner;
            await usersCollection.updateOne({ _id: partnerId }, { $set: { partner: null, searching: false } });
            await bot.telegram.sendMessage(partnerId, "💔 **Obrolan kamu telah dihentikan oleh pasanganmu karena dia ingin mencari filter baru.**" + infoTeksNavigasi, { parse_mode: 'Markdown' });
        }

        await usersCollection.updateOne({ _id: ctx.chat.id }, { $set: { partner: null, searching: false, targetGender: null, targetAge: null } });
        
        await ctx.reply(
            "Filter Baru - Langkah 1/2:\nMau cari pasangan chat gender apa?",
            Markup.inlineKeyboard([
                [Markup.button.callback('♂️ Cari Cowok', 'find_gender_cowok')],
                [Markup.button.callback('♀️ Cari Cewek', 'find_gender_cewek')]
            ])
        );
    } catch (err) {
        console.error(err);
    }
});

// 7. COMMAND /STOP (Berhenti Mengobrol + Memunculkan Navigasi Opsi Pilihan)
bot.command('stop', async (ctx) => {
    try {
        const usersCollection = await connectDB();
        let user = await usersCollection.findOne({ _id: ctx.chat.id });
        
        if (user && user.partner) {
            const partnerId = user.partner;
            
            // Putuskan hubungan tapi biarkan filter target (targetGender & targetAge) tetap ada agar /next masih bisa bekerja
            await usersCollection.updateOne({ _id: ctx.chat.id }, { $set: { partner: null, searching: false } });
            await usersCollection.updateOne({ _id: partnerId }, { $set: { partner: null, searching: false } });
            
            await bot.telegram.sendMessage(ctx.chat.id, "🛑 **Kamu telah menghentikan obrolan.**" + infoTeksNavigasi, { parse_mode: 'Markdown' });
            await bot.telegram.sendMessage(partnerId, "🛑 **Pasanganmu telah menghentikan obrolan.**" + infoTeksNavigasi, { parse_mode: 'Markdown' });
        } else {
            await usersCollection.updateOne({ _id: ctx.chat.id }, { $set: { searching: false } });
            await ctx.reply("🛑 **Pencarian dibatalkan.**" + infoTeksNavigasi, { parse_mode: 'Markdown' });
        }
    } catch (err) {
        console.error(err);
    }
});

// 8. CHAT FORWARDING
bot.on('message', async (ctx) => {
    try {
        const usersCollection = await connectDB();
        let user = await usersCollection.findOne({ _id: ctx.chat.id });
        if (user && user.partner) {
            await bot.telegram.copyMessage(user.partner, ctx.chat.id, ctx.message.message_id);
        }
    } catch (err) {
        console.error("Error forwarding message:", err);
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
