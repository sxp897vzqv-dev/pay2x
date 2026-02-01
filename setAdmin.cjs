const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const uid = 'mLYZrau2jiOsIL0y6RX16HPzRu22';

admin.auth().setCustomUserClaims(uid, { admin: true })
  .then(() => {
    console.log('✅ Admin claim set');
    process.exit();
  })
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });