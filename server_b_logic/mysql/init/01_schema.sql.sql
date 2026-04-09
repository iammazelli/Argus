CREATE DATABASE IF NOT EXISTS ArgusDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ArgusDB;

CREATE TABLE IF NOT EXISTS Devices (
    Device_Id INT AUTO_INCREMENT PRIMARY KEY,
    Device_Hash VARCHAR(64) UNIQUE NOT NULL,
    Device_Name VARCHAR(255) NOT NULL,
    Notification_Email VARCHAR(255),
    Device_Location POINT SRID 4326 NOT NULL, 
    Device_Is_Active BOOLEAN DEFAULT TRUE,
    Device_Created_At TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    Device_Last_Seen TIMESTAMP NULL,
    SPATIAL INDEX idx_location (Device_Location),
    INDEX idx_active (Device_Is_Active),
    INDEX idx_hash (Device_Hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS Real_Time_Data (
    Id BIGINT AUTO_INCREMENT PRIMARY KEY,
    Device_Id INT NOT NULL,
    Data_Payload JSON NOT NULL,
    Data_Time_Stamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (Device_Id) REFERENCES Devices(Device_Id) ON DELETE CASCADE,
    INDEX idx_device_time (Device_Id, Data_Time_Stamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS Historical_Data (
    Id BIGINT AUTO_INCREMENT PRIMARY KEY,
    Device_Id INT NOT NULL,
    Variable VARCHAR(50) NOT NULL,
    Var_Avg DOUBLE NOT NULL,
    Var_Min DOUBLE NOT NULL,
    Var_Max DOUBLE NOT NULL,
    Var_Std DOUBLE NOT NULL DEFAULT 0,
    Data_Time_Stamp TIMESTAMP NOT NULL,
    FOREIGN KEY (Device_Id) REFERENCES Devices(Device_Id) ON DELETE CASCADE,
    INDEX idx_hist_analytics (Device_Id, Variable, Data_Time_Stamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS Events (
    Event_Id INT AUTO_INCREMENT PRIMARY KEY,
    Device_Id INT NOT NULL,
    Event_Var_Name VARCHAR(255) NOT NULL,
    Event_Var_Value TEXT,
    Event_Trigger VARCHAR(10),
    Event_Action TEXT,
    FOREIGN KEY (Device_Id) REFERENCES Devices(Device_Id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS Event_Log (
    Log_Id BIGINT AUTO_INCREMENT PRIMARY KEY,
    Event_Id INT NOT NULL,
    Event_Time_Stamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (Event_Id) REFERENCES Events(Event_Id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Usuário do backend: permissão de escrita e leitura
CREATE USER IF NOT EXISTS 'argus_backend'@'%' IDENTIFIED BY 'senha_backend_123';
GRANT SELECT, INSERT, UPDATE, DELETE ON ArgusDB.* TO 'argus_backend'@'%';

-- Usuário do frontend: apenas leitura
CREATE USER IF NOT EXISTS 'argus_frontend'@'%' IDENTIFIED BY 'senha_frontend_123';
GRANT SELECT ON ArgusDB.* TO 'argus_frontend'@'%';

FLUSH PRIVILEGES;