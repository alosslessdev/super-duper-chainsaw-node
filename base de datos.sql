CREATE DATABASE IF NOT EXISTS gestion_tareas;

USE gestion_tareas;

CREATE TABLE usuario (
    pk INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255),
    salt VARCHAR(255)
);

CREATE TABLE tarea (
    pk INT AUTO_INCREMENT PRIMARY KEY,
    fecha_inicio DATETIME,
    fecha_fin DATETIME,
    descripcion TEXT,
    prioridad VARCHAR(50),
    titulo TEXT,
    usuario INT,
    tiempo_estimado VARCHAR(50),
    horas INT,
    hecho boolean,
    tipo varchar(50),
    FOREIGN KEY (usuario) REFERENCES usuario(pk)
);

-- pruebas, debe ser generado con swagger, contraseña de prueba es asdf
INSERT INTO usuario (email, password, salt) VALUES
('alice.smith@example.com', 'y3+6s/VmKLGim7j5TOFXZ1DOcPEi8G1rbkvl5r4JEySHKuUp/AqymAVHovhXkC01TwpReQ8rKhl6HCophVeiyXkzbXzNMmiIXCIKNi0Ho9KazWzKLILZldd+tMiywC6ml4jh00ZNVU5F5phj7aQzV1qCOnwNPzvz8h9TbKCCwwg=', '910M8V6hJg1tjc3kYMeNjcYln+28PExnx6BS+BlkfPUJ2Poy0EBcY7WgfgsUtPGo99/F51WAoXm7XCZDq1P3TA=='),
('bob.johnson@example.com', 'y3+6s/VmKLGim7j5TOFXZ1DOcPEi8G1rbkvl5r4JEySHKuUp/AqymAVHovhXkC01TwpReQ8rKhl6HCophVeiyXkzbXzNMmiIXCIKNi0Ho9KazWzKLILZldd+tMiywC6ml4jh00ZNVU5F5phj7aQzV1qCOnwNPzvz8h9TbKCCwwg=', '910M8V6hJg1tjc3kYMeNjcYln+28PExnx6BS+BlkfPUJ2Poy0EBcY7WgfgsUtPGo99/F51WAoXm7XCZDq1P3TA=='),
('charlie.brown@example.com', 'y3+6s/VmKLGim7j5TOFXZ1DOcPEi8G1rbkvl5r4JEySHKuUp/AqymAVHovhXkC01TwpReQ8rKhl6HCophVeiyXkzbXzNMmiIXCIKNi0Ho9KazWzKLILZldd+tMiywC6ml4jh00ZNVU5F5phj7aQzV1qCOnwNPzvz8h9TbKCCwwg=', '910M8V6hJg1tjc3kYMeNjcYln+28PExnx6BS+BlkfPUJ2Poy0EBcY7WgfgsUtPGo99/F51WAoXm7XCZDq1P3TA==');

-- Insert data into the 'tarea' table
-- Assuming user PKs are 1, 2, 3 based on auto-increment from above inserts
INSERT INTO tarea (fecha_inicio, fecha_fin, descripcion, prioridad, titulo, usuario, tiempo_estimado, horas, hecho, tipo) VALUES
('2024-07-01 00:00:00', '2024-07-05 00:00:00', 'Develop new feature for user authentication module.', 'Alta', 'Implement User Auth', 1, '4 dias', 4, FALSE, NULL),
('2024-07-02 00:00:00', '2024-07-03 00:00:00', 'Review pull requests from junior developers.', 'Media', 'Code Review Session', 1, '1 dia', 1, FALSE, NULL),
('2024-07-05 00:00:00', '2024-07-10 00:00:00', 'Write documentation for API endpoints.', 'Baja', 'API Documentation', 1, '5 dias', 5, FALSE, NULL),
('2024-07-01 00:00:00', '2024-07-08 00:00:00', 'Design database schema for new reporting module.', 'Alta', 'Database Design', 2, '7 dias', 7, FALSE, NULL),
('2024-07-09 00:00:00', '2024-07-12 00:00:00', 'Prepare presentation for quarterly review.', 'Media', 'Quarterly Review Prep', 2, '3 dias', 3, FALSE, NULL),
('2024-07-15 00:00:00', '2024-07-15 00:00:00', 'Investigate bug in payment processing system.', 'Alta', 'Payment Bug Fix', 3, '2 dias', 2, FALSE, NULL),
('2024-07-03 00:00:00', '2024-07-04 00:00:00', 'Set up development environment for new project.', 'Media', 'Dev Environment Setup', 3, '1 dia', 1, FALSE, NULL),
('2024-07-06 00:00:00', '2024-07-07 00:00:00', 'Attend team meeting and provide status updates.', 'Baja', 'Team Meeting', 3, '1 dia', 1, FALSE, NULL),
('2024-07-08 00:00:00', '2024-07-14 00:00:00', 'Research new technologies for front-end development.', 'Media', 'Front-end Tech Research', 1, '6 dias', 6, FALSE, NULL);