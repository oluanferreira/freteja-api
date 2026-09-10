-- Seed 002: Demo Investidor
-- Dados realistas para apresentação com investidor
-- Senhas: 123456 (bcrypt hash abaixo)
-- UUIDs usam apenas hex valido (0-9, a-f)

-- ============================================
-- USUARIOS
-- ============================================

-- Embarcador: João Silva (conta do investidor)
INSERT INTO users (id, email, phone, password_hash, name, cpf_cnpj, role, status, rating_avg, rating_count)
VALUES (
  'e1000000-0000-0000-0000-000000000001',
  'joao@freteja.com',
  '77999110001',
  '$2b$10$GqZj5EAvQABbPgjcQouRPeRWCfO/JDc1VtZQ3/P08wd2wFJRNMm.u',
  'Joao Silva',
  '12345678900',
  'embarcador',
  'active',
  4.80,
  12
) ON CONFLICT (email) DO NOTHING;

-- Motorista: Carlos Oliveira (segundo celular)
INSERT INTO users (id, email, phone, password_hash, name, cpf_cnpj, role, status, rating_avg, rating_count)
VALUES (
  'd1000000-0000-0000-0000-000000000001',
  'carlos@freteja.com',
  '77999220001',
  '$2b$10$GqZj5EAvQABbPgjcQouRPeRWCfO/JDc1VtZQ3/P08wd2wFJRNMm.u',
  'Carlos Oliveira',
  '98765432100',
  'motorista',
  'approved',
  4.90,
  28
) ON CONFLICT (email) DO NOTHING;

-- Motorista 2: Pedro Santos (propostas concorrentes)
INSERT INTO users (id, email, phone, password_hash, name, cpf_cnpj, role, status, rating_avg, rating_count)
VALUES (
  'd2000000-0000-0000-0000-000000000001',
  'pedro@freteja.com',
  '77999330001',
  '$2b$10$GqZj5EAvQABbPgjcQouRPeRWCfO/JDc1VtZQ3/P08wd2wFJRNMm.u',
  'Pedro Santos',
  '11122233344',
  'motorista',
  'approved',
  4.50,
  15
) ON CONFLICT (email) DO NOTHING;

-- Motorista 3: Ana Costa
INSERT INTO users (id, email, phone, password_hash, name, cpf_cnpj, role, status, rating_avg, rating_count)
VALUES (
  'd3000000-0000-0000-0000-000000000001',
  'ana@freteja.com',
  '77999440001',
  '$2b$10$GqZj5EAvQABbPgjcQouRPeRWCfO/JDc1VtZQ3/P08wd2wFJRNMm.u',
  'Ana Costa',
  '55566677788',
  'motorista',
  'approved',
  4.70,
  20
) ON CONFLICT (email) DO NOTHING;

-- Embarcador 2: Maria Loja (historico)
INSERT INTO users (id, email, phone, password_hash, name, cpf_cnpj, role, status, rating_avg, rating_count)
VALUES (
  'e2000000-0000-0000-0000-000000000001',
  'maria@freteja.com',
  '77999550001',
  '$2b$10$GqZj5EAvQABbPgjcQouRPeRWCfO/JDc1VtZQ3/P08wd2wFJRNMm.u',
  'Maria Ferreira - Loja Casa Nova',
  '99988877766',
  'embarcador',
  'active',
  4.60,
  8
) ON CONFLICT (email) DO NOTHING;

-- ============================================
-- FRETES CONCLUIDOS (historico)
-- ============================================

-- Frete 1: Concluido - Mudanca residencial
INSERT INTO rides (id, embarcador_id, driver_id, status,
  origin_address, origin_location,
  destination_address, destination_location,
  cargo_description, vehicle_type_preferred, notes,
  suggested_price, final_price, commission_rate, commission_amount,
  accepted_at, collected_at, delivered_at, created_at)
VALUES (
  'a1000000-0000-0000-0000-000000000001',
  'e1000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000001',
  'completed',
  'Rua Sergipe, 450 - Centro, Vitoria da Conquista',
  ST_MakePoint(-40.8442, -14.8619)::geography,
  'Av. Bartolomeu de Gusmao, 120 - Candeias, Vitoria da Conquista',
  ST_MakePoint(-40.8356, -14.8508)::geography,
  'Mudanca residencial - 2 quartos, sofa, geladeira, fogao',
  'caminhao',
  'Precisa de ajuda pra carregar. 3o andar sem elevador',
  450.00, 420.00, 0.12, 50.40,
  NOW() - INTERVAL '5 days',
  NOW() - INTERVAL '5 days' + INTERVAL '30 minutes',
  NOW() - INTERVAL '5 days' + INTERVAL '3 hours',
  NOW() - INTERVAL '6 days'
) ON CONFLICT (id) DO NOTHING;

-- Frete 2: Concluido - Entrega loja
INSERT INTO rides (id, embarcador_id, driver_id, status,
  origin_address, origin_location,
  destination_address, destination_location,
  cargo_description, vehicle_type_preferred,
  suggested_price, final_price, commission_rate, commission_amount,
  accepted_at, collected_at, delivered_at, created_at)
VALUES (
  'a2000000-0000-0000-0000-000000000001',
  'e2000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000001',
  'completed',
  'Av. Brumado, 800 - Recreio, Vitoria da Conquista',
  ST_MakePoint(-40.8580, -14.8700)::geography,
  'Rua Rio Branco, 230 - Centro, Jequie',
  ST_MakePoint(-40.0836, -13.8577)::geography,
  'Moveis planejados - cozinha completa (8 caixas)',
  'utilitario',
  280.00, 260.00, 0.12, 31.20,
  NOW() - INTERVAL '3 days',
  NOW() - INTERVAL '3 days' + INTERVAL '20 minutes',
  NOW() - INTERVAL '3 days' + INTERVAL '2 hours',
  NOW() - INTERVAL '4 days'
) ON CONFLICT (id) DO NOTHING;

-- Frete 3: Concluido - Eletrodomesticos
INSERT INTO rides (id, embarcador_id, driver_id, status,
  origin_address, origin_location,
  destination_address, destination_location,
  cargo_description, vehicle_type_preferred,
  suggested_price, final_price, commission_rate, commission_amount,
  accepted_at, collected_at, delivered_at, created_at)
VALUES (
  'a3000000-0000-0000-0000-000000000001',
  'e1000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000001',
  'completed',
  'Magazine Conquista - Av. Frei Benjamin, 300',
  ST_MakePoint(-40.8410, -14.8650)::geography,
  'Cond. Alphaville, Casa 42 - Boa Vista, Vitoria da Conquista',
  ST_MakePoint(-40.8200, -14.8400)::geography,
  'Geladeira frost free + maquina de lavar',
  'utilitario',
  150.00, 140.00, 0.12, 16.80,
  NOW() - INTERVAL '1 day',
  NOW() - INTERVAL '1 day' + INTERVAL '15 minutes',
  NOW() - INTERVAL '1 day' + INTERVAL '1 hour',
  NOW() - INTERVAL '2 days'
) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- FRETE EM ANDAMENTO (pra demo ao vivo)
-- ============================================

-- Frete 4: Aceito, motorista a caminho
INSERT INTO rides (id, embarcador_id, driver_id, status,
  origin_address, origin_location,
  destination_address, destination_location,
  cargo_description, vehicle_type_preferred, notes,
  suggested_price, final_price, commission_rate,
  accepted_at, created_at)
VALUES (
  'a4000000-0000-0000-0000-000000000001',
  'e2000000-0000-0000-0000-000000000001',
  'd3000000-0000-0000-0000-000000000001',
  'accepted',
  'Atacadao - Rod. BA-263, Km 2, Vitoria da Conquista',
  ST_MakePoint(-40.8700, -14.8750)::geography,
  'Supermercado Boa Escolha - Av. Oliva Matos, 500',
  ST_MakePoint(-40.8300, -14.8550)::geography,
  'Carga de bebidas - 50 caixas de refrigerante',
  'van',
  'Entregar no deposito dos fundos',
  200.00, 185.00, 0.12,
  NOW() - INTERVAL '20 minutes',
  NOW() - INTERVAL '1 hour'
) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- FRETE PENDENTE (esperando propostas - pra demo ao vivo!)
-- ============================================

-- Frete 5: Pendente - O investidor vai ver propostas chegando
INSERT INTO rides (id, embarcador_id, status,
  origin_address, origin_location,
  destination_address, destination_location,
  cargo_description, vehicle_type_preferred, notes,
  suggested_price, commission_rate, created_at)
VALUES (
  'a5000000-0000-0000-0000-000000000001',
  'e1000000-0000-0000-0000-000000000001',
  'pending',
  'Rua Sao Paulo, 180 - Jurema, Vitoria da Conquista',
  ST_MakePoint(-40.8480, -14.8550)::geography,
  'Condominio Park Sul, Bloco B - Lagoa das Flores, Vitoria da Conquista',
  ST_MakePoint(-40.8100, -14.8300)::geography,
  'Mesa de jantar 6 lugares + 6 cadeiras + aparador',
  'utilitario',
  'Moveis desmontados. Precisa subir pro 2o andar',
  180.00, 0.12,
  NOW() - INTERVAL '10 minutes'
) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- PROPOSTAS para frete pendente
-- ============================================

-- Pedro ja enviou proposta pro frete 5
INSERT INTO proposals (id, ride_id, driver_id, proposed_price, message, status, created_at)
VALUES (
  'b1000000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000001',
  165.00,
  'Tenho utilitario Fiat Fiorino, posso ir agora. Incluo ajuda pra subir.',
  'pending',
  NOW() - INTERVAL '5 minutes'
) ON CONFLICT (id) DO NOTHING;

-- Ana tambem enviou
INSERT INTO proposals (id, ride_id, driver_id, proposed_price, message, status, created_at)
VALUES (
  'b2000000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',
  'd3000000-0000-0000-0000-000000000001',
  175.00,
  'Disponivel em 15 minutos. Van Renault Master com rampa.',
  'pending',
  NOW() - INTERVAL '3 minutes'
) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- PROPOSTAS aceitas dos fretes concluidos
-- ============================================

INSERT INTO proposals (id, ride_id, driver_id, proposed_price, message, status, responded_at, created_at)
VALUES
  ('b3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 420.00, 'Tenho caminhao 3/4 com 2 ajudantes', 'accepted', NOW() - INTERVAL '5 days', NOW() - INTERVAL '6 days'),
  ('b4000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 260.00, 'Faco o frete ate Jequie sem problema', 'accepted', NOW() - INTERVAL '3 days', NOW() - INTERVAL '4 days'),
  ('b5000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 140.00, 'Tenho Fiorino, pego na loja', 'accepted', NOW() - INTERVAL '1 day', NOW() - INTERVAL '2 days')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- PAGAMENTOS dos fretes concluidos
-- ============================================

INSERT INTO payments (id, ride_id, payer_id, amount, commission_amount, driver_amount, method, status, paid_at, created_at)
VALUES
  ('aa100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 420.00, 50.40, 369.60, 'pix', 'paid', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'),
  ('aa200000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 260.00, 31.20, 228.80, 'pix', 'paid', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),
  ('aa300000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 140.00, 16.80, 123.20, 'cartao', 'paid', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- WALLET TRANSACTIONS (saldo do motorista Carlos)
-- ============================================

INSERT INTO wallet_transactions (id, driver_id, ride_id, type, amount, description, created_at)
VALUES
  ('ae100000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'credit', 369.60, 'Frete - Mudanca residencial', NOW() - INTERVAL '5 days'),
  ('ae200000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'credit', 228.80, 'Frete - Moveis planejados', NOW() - INTERVAL '3 days'),
  ('ae300000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', NULL, 'debit', 200.00, 'Saque via PIX', NOW() - INTERVAL '2 days')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- AVALIACOES
-- ============================================

-- Avaliacoes do frete 1
INSERT INTO ratings (id, ride_id, from_user_id, to_user_id, score, comment, created_at)
VALUES
  ('ab100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 5, 'Excelente! Muito cuidadoso com os moveis. Recomendo!', NOW() - INTERVAL '5 days'),
  ('ab200000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 5, 'Tudo organizado, facil de carregar. Otimo cliente!', NOW() - INTERVAL '5 days')
ON CONFLICT (id) DO NOTHING;

-- Avaliacoes do frete 2
INSERT INTO ratings (id, ride_id, from_user_id, to_user_id, score, comment, created_at)
VALUES
  ('ab300000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 5, 'Entregou certinho em Jequie, sem atrasos', NOW() - INTERVAL '3 days'),
  ('ab400000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 4, 'Carga bem embalada, tudo certo', NOW() - INTERVAL '3 days')
ON CONFLICT (id) DO NOTHING;

-- Avaliacoes do frete 3
INSERT INTO ratings (id, ride_id, from_user_id, to_user_id, score, comment, created_at)
VALUES
  ('ab500000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 4, 'Chegou no horario, entregou direitinho', NOW() - INTERVAL '1 day'),
  ('ab600000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 5, 'Cliente pontual, local facil de achar', NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- MENSAGENS DO CHAT (frete em andamento)
-- ============================================

INSERT INTO messages (id, ride_id, sender_id, text, type, created_at)
VALUES
  ('ac100000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 'Estou saindo agora, chego em 15 minutos', 'text', NOW() - INTERVAL '15 minutes'),
  ('ac200000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'Ok, vou avisar o deposito', 'text', NOW() - INTERVAL '12 minutes'),
  ('ac300000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 'Estou chegando', 'quick', NOW() - INTERVAL '3 minutes')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- NOTIFICACOES
-- ============================================

INSERT INTO notifications (id, user_id, type, title, body, read, created_at)
VALUES
  ('ad100000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'new_proposal', 'Nova proposta recebida', 'Pedro Santos enviou uma proposta de R$ 165,00 para seu frete', false, NOW() - INTERVAL '5 minutes'),
  ('ad200000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'new_proposal', 'Nova proposta recebida', 'Ana Costa enviou uma proposta de R$ 175,00 para seu frete', false, NOW() - INTERVAL '3 minutes'),
  ('ad300000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'payment_received', 'Pagamento recebido!', 'Voce recebeu R$ 369,60 pelo frete de mudanca', true, NOW() - INTERVAL '5 days'),
  ('ad400000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'new_ride', 'Novo frete disponivel', 'Frete de moveis em Vitoria da Conquista - R$ 180,00', false, NOW() - INTERVAL '10 minutes')
ON CONFLICT (id) DO NOTHING;
