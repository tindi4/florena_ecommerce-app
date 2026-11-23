-- Mot de passe oublié en 2 étapes :
-- 1. l'équipe écrit d'abord au client sur WhatsApp pour lui demander si la demande vient bien de lui (contacted_at/by) ;
-- 2. quand il répond oui, elle crée le lien (30 min) et le lui envoie : il peut l'utiliser tout de suite.
ALTER TABLE customer_reset_requests
  ADD COLUMN contacted_at DATETIME NULL AFTER last_requested_at,
  ADD COLUMN contacted_by INT UNSIGNED NULL AFTER contacted_at,
  ADD CONSTRAINT fk_reset_req_contacted FOREIGN KEY (contacted_by) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE customer_reset_log
  MODIFY action ENUM('DEMANDE','CLIENT_CONTACTE','LIEN_CREE','DEMANDE_IGNOREE','MOT_DE_PASSE_CHANGE') NOT NULL;
