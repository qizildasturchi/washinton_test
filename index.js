require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const ExcelJS = require('exceljs');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const admins = process.env.ADMIN_TELEGRAM_ID.split(',');
const users = {};

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    if (users[chatId]?.state === 'finished') {
        await bot.sendMessage(chatId, "Siz allaqachon ro'yxatdan o'tgansiz.");
        return;
    }

    users[chatId] = { state: 'start' };
    await bot.sendMessage(chatId, "Iltimos, quyidagi kanallarga a'zo bo'ling:", {
        reply_markup: JSON.stringify({
            inline_keyboard: [
                [{ text: "1-kanalga a'zo bo'ling", url: 'https://t.me/washington_school1' }],
                [{ text: "2-kanalga a'zo bo'ling", url: 'https://t.me/washington_school_ws' }],
                [{ text: "A'zo bo'ldim", callback_data: 'subscription_check' }]
            ]
        })
    });
});

bot.on('callback_query', async (callbackQuery) => {
    const { message, data } = callbackQuery;
    const chatId = message.chat.id;
    const user = users[chatId] ?? {};

    if (data === 'subscription_check' && user.state === 'start') {
        user.state = 'awaiting_name';
        await bot.sendMessage(chatId, "Tasdiqlash uchun rahmat! Endi, iltimos, ismingizni kiriting:");
    } else if (data.startsWith('subject_') && user.state === 'awaiting_subject') {
        user.subject = data.split('_')[1];
        user.state = 'finished';
        await saveUserData(chatId, user);
    } else if (admins.includes(chatId.toString()) && data.startsWith('admin_subject_')) {
        const subject = data.split('_')[2];
        await exportDataToExcel(chatId, subject);
    } else if (data === 'rate_student') {
        users[chatId] = { state: 'awaiting_student_id_for_rating' };
        await bot.sendMessage(chatId, "Qaysi raqamdagi o'quvchiga bal qo'ymoqchisiz?");
    }

    users[chatId] = user;
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const user = users[chatId] ?? {};

    console.log(`Received message from ${chatId}: ${msg.text}, user state: ${user.state}`);

    if (user.state === 'awaiting_student_id_for_rating') {
        user.studentIdToRate = msg.text;
        user.state = 'awaiting_rating';
        console.log(`Waiting for score, studentIdToRate: ${user.studentIdToRate}`);
        await bot.sendMessage(chatId, "Nechi bal qo'ymoqchisiz?");
    } else if (user.state === 'awaiting_rating') {
        const score = parseInt(msg.text, 10);
        if (isNaN(score)) {
            await bot.sendMessage(chatId, "Iltimos, raqam kiriting.");
            return;
        }
        const studentId = user.studentIdToRate;
        await addScoreToStudent(chatId, studentId, score);
        delete users[chatId];
    } else if (user.state === 'awaiting_name') {
        user.name = msg.text;
        user.state = 'awaiting_surname';
        await bot.sendMessage(chatId, "Endi, iltimos, familiyangizni kiriting:");
    } else if (user.state === 'awaiting_surname') {
        user.surname = msg.text;
        user.state = 'awaiting_school';
        await bot.sendMessage(chatId, "Qaysi maktabda o'qiysiz?");
    } else if (user.state === 'awaiting_school') {
        user.school = msg.text;
        user.state = 'awaiting_class';
        await bot.sendMessage(chatId, "Qaysi sinfda o'qiysiz?");
    } else if (user.state === 'awaiting_class') {
        user.class = msg.text;
        user.state = 'awaiting_subject';
        await showSubjects(chatId);
    }
});

async function showSubjects(chatId) {
    await bot.sendMessage(chatId, "Qaysi fan boyicha olimpiadaga qatnashmoqchisiz?", {
        reply_markup: JSON.stringify({
            inline_keyboard: [
                [{ text: "Matematika", callback_data: 'subject_math' }],
                [{ text: "Ingliz tili", callback_data: 'subject_english' }],
                [{ text: "Rus tili", callback_data: 'subject_russian' }],
                [{ text: "IT", callback_data: 'subject_it' }]
            ]
        })
    });
}

async function saveUserData(chatId, user) {
    const dataFile = 'data.json';
    let data = [];

    try {
        data = JSON.parse(await fs.readFile(dataFile, 'utf8'));
    } catch (error) {
        console.error("Error reading data file:", error);
        data = [];
    }

    user.userId = data.length + 1;
    data.push({ id: chatId, ...user });

    try {
        await fs.writeFile(dataFile, JSON.stringify(data, null, 2));
        await bot.sendMessage(chatId, `Ro'yxatdan o'tkazish yakunlandi. Sizning tartib raqamingiz: ${user.userId}. Tanlagan faningiz: ${user.subject}`);
    } catch (error) {
        console.error("Error writing data file:", error);
    }
}

async function addScoreToStudent(chatId, studentId, score) {
    const dataFile = 'data.json';
    let data = [];

    try {
        data = JSON.parse(await fs.readFile(dataFile, 'utf8'));
        const student = data.find(user => user.userId.toString() === studentId);
        if (student) {
            student.score = score;
            await fs.writeFile(dataFile, JSON.stringify(data, null, 2));
            await bot.sendMessage(chatId, "Ball muvaffaqiyatli qo'shildi.");
        } else {
            await bot.sendMessage(chatId, "O'quvchi topilmadi.");
        }
    } catch (error) {
        console.error("Error updating data file:", error);
    }
}

bot.onText(/\/admin/, async (msg) => {
    const chatId = msg.chat.id;

    // Foydalanuvchi holatini aniqlaymiz yoki yangi holat bilan yangilaymiz
    const user = users[chatId] ?? {};
    users[chatId] = user;

    if (!admins.includes(chatId.toString())) {
        await bot.sendMessage(chatId, "Sizda administrator huquqlari yo'q.");
        return;
    }

    // Admin holatini o'rnatamiz yoki saqlab qolamiz
    user.state = 'admin_panel';
    await showAdminOptions(chatId);
});




 


bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const user = users[chatId] ?? {};

    if (user.state === 'awaiting_student_id_for_rating') {
        user.studentIdToRate = msg.text;
        user.state = 'awaiting_rating';
        await bot.sendMessage(chatId, "Nechi bal qo'ymoqchisiz?");
    } else if (user.state === 'awaiting_rating') {
        const score = parseInt(msg.text, 10);
        if (isNaN(score)) {
            await bot.sendMessage(chatId, "Iltimos, raqam kiriting.");
            return;
        }
        const studentId = user.studentIdToRate;
        await addScoreToStudent(chatId, studentId, score);
        delete users[chatId];
    } else if (user.state === 'admin_panel') {
        // Admin panelidan kelgan raqamni o'quvchi IDsi sifatida qabul qilish
        user.studentIdToRate = msg.text;
        user.state = 'awaiting_rating'; // Keyingi qadamga o'tish
        await bot.sendMessage(chatId, "Nechi bal qo'ymoqchisiz?");
    }
    // Boshqa holatlar...
});




function showAdminOptions(chatId) {
    bot.sendMessage(chatId, "Admin paneli:", {
        reply_markup: JSON.stringify({
            inline_keyboard: [
                [{ text: "Matematika", callback_data: 'admin_subject_math' }],
                [{ text: "Ingliz tili", callback_data: 'admin_subject_english' }],
                [{ text: "Rus tili", callback_data: 'admin_subject_russian' }],
                [{ text: "IT", callback_data: 'admin_subject_it' }],
                [{ text: "Baholash", callback_data: 'rate_student' }]
            ]
        })
    });
}

async function exportDataToExcel(chatId, subject) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Olimpiada Qatnashchilari');

    sheet.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Ism', key: 'name', width: 30 },
        { header: 'Familiya', key: 'surname', width: 30 },
        { header: 'Maktab', key: 'school', width: 30 },
        { header: 'Sinf', key: 'class', width: 10 },
        { header: 'Fani', key: 'subject', width: 20 },
        { header: 'Ball', key: 'score', width: 10 }
    ];

    let data;
    try {
        data = JSON.parse(await fs.readFile('data.json', { encoding: 'utf8' }));
    } catch (error) {
        console.error("Error reading data for Excel export:", error);
        data = [];
    }

    const filteredUsers = data.filter(user => user.subject?.toLowerCase() === subject.toLowerCase());
    filteredUsers.forEach(user => sheet.addRow(user));

    if (!filteredUsers.length) {
        await bot.sendMessage(chatId, "Ushbu fandan ro'yxatga olingan foydalanuvchilar yo'q.");
        return;
    }

    const filePath = path.resolve(__dirname, `Olimpiada_Qatnashchilari_${subject}.xlsx`);
    try {
        await workbook.xlsx.writeFile(filePath);
        await bot.sendDocument(chatId, filePath);
    } catch (error) {
        console.error("Error exporting data to Excel:", error);
    } finally {
        try {
            await fs.unlink(filePath);
        } catch (error) {
            console.error("Error deleting the temporary Excel file:", error);
        }
    }
}

bot.on('polling_error', (error) => console.error(error));

console.log("Bot ishga tushirildi.");
