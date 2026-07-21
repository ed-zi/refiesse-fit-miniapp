-- Платёжные/юридические данные пользователя (ИП на УСН).
-- email — контакт плательщика для чека ЮKassa (ФФД/облачная касса) и повторных
-- списаний. consent_* — след согласия по 152-ФЗ (когда и какую версию оферты/
-- политики принял при оплате).
ALTER TABLE "users" ADD COLUMN "email" TEXT;
ALTER TABLE "users" ADD COLUMN "consent_accepted_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "consent_doc_version" TEXT;
