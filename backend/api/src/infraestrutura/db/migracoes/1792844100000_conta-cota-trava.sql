-- Up Migration
-- Espera máxima de 2 s pela trava do contador de e-mails do dia (ACE-75; SEC-CA-13, AD-013, T68). Aditiva (G-14): só
-- acrescenta uma configuração à função que a pelada_app chama, sem mudar a assinatura nem o corpo.
-- A reserva trava a linha do dia até o fim da transação da requisição, que inclui o envio ao Resend. Sem tempo máximo,
-- um Resend lento enfileirava todos os envios, cada um segurando uma conexão. Com o lock_timeout na função, a
-- reserva que esperar mais de 2 s falha com 55P03 (a API responde 503 email_indisponivel). O SET da função vale só
-- enquanto ela roda: o resto da transação segue com o lock_timeout da conexão.
ALTER FUNCTION email_cota_reservar(integer) SET lock_timeout = '2s';
