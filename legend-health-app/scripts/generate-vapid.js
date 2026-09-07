const webpush = require('web-push');
const keys = webpush.generateVAPIDKeys();
console.log('\n請把以下變數加入 Railway → Variables：\n');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('VAPID_SUBJECT=mailto:your-email@example.com\n');
