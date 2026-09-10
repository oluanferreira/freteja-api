-- Seed: Admin user
-- Password: admin123 (bcrypt hash - CHANGE IN PRODUCTION)
-- Hash generated with: await bcrypt.hash('admin123', 10)

INSERT INTO users (email, phone, password_hash, name, cpf_cnpj, role, status)
VALUES (
  'admin@freteja.com.br',
  '+5577999999999',
  '$2b$10$placeholder.hash.will.be.replaced.on.first.login',
  'Admin FreteJá',
  '00000000000',
  'admin',
  'active'
) ON CONFLICT (email) DO NOTHING;
