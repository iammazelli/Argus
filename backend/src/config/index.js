require('dotenv').config();

module.exports = {
    database: {
        host: process.env.MYSQL_HOST,
        port: process.env.MYSQL_PORT,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DB
    },
    mqtt: {
        brokerUrl: process.env.MQTT_BROKER_URL,
        topic: 'devices/+/data'
    }
};