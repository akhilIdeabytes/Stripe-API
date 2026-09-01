-- ---------------------------------------------------------------
--  Ledger — Stripe payment hub
--  MySQL 8.0 schema
--
--  Matches the TypeORM entities exactly. If you run this by hand you
--  MUST set `synchronize: false` in src/config/typeorm.config.ts —
--  otherwise TypeORM will compare its own idea of the schema against
--  these tables on every boot and silently ALTER them (it names indexes
--  with generated hashes, so it will not recognise the readable names
--  used below, and it does not know about the extra foreign keys).
--
--  Money is stored in the smallest currency unit (cents), as INT, which
--  matches Stripe. Ceiling is 2,147,483,647 = $21.4M for a single row.
--  If one payment could ever exceed that, switch the amount columns to
--  BIGINT here and to `{ type: 'bigint' }` in the entities.
-- ---------------------------------------------------------------

CREATE DATABASE IF NOT EXISTS `stripe_api`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `stripe_api`;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;


-- ---------------------------------------------------------------
-- tenants — the source platforms (insurance, DG)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tenants` (
  `id`              INT           NOT NULL AUTO_INCREMENT,
  -- Machine identifier used in the X-Tenant-Slug header, e.g. 'insurance'
  `slug`            VARCHAR(255)  NOT NULL,
  `name`            VARCHAR(255)  NOT NULL,
  -- bcrypt hash of the API key. The plaintext is shown once and is
  -- never recoverable — same treatment as a user password.
  `apiKeyHash`      VARCHAR(255)  NOT NULL,
  `apiKeyLast4`     VARCHAR(255)  NULL,
  -- Where we POST payment/refund status changes
  `webhookUrl`      VARCHAR(255)  NULL,
  -- Shared secret for the HMAC-SHA256 signature on outbound webhooks
  `webhookSecret`   VARCHAR(255)  NULL,
  `defaultCurrency` VARCHAR(255)  NOT NULL DEFAULT 'usd',
  `active`          TINYINT       NOT NULL DEFAULT 1,
  `createdAt`       DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`       DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                  ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tenants_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------
-- customer_sources — the named customer feeds each platform exposes.
-- The insurance platform has Corporates and Employees; DG has its own.
-- Import asks which one to pull.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `customer_sources` (
  `id`          INT           NOT NULL AUTO_INCREMENT,
  `tenantId`    INT           NOT NULL,
  -- Shown in the Import picker, e.g. 'Corporates'
  `name`        VARCHAR(255)  NOT NULL,
  `url`         VARCHAR(255)  NOT NULL,
  -- Sent as `Authorization: Bearer <token>` when calling the feed
  `token`       VARCHAR(255)  NULL,
  `description` VARCHAR(255)  NULL,
  `active`      TINYINT       NOT NULL DEFAULT 1,
  `createdAt`   DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`   DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                              ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customer_sources_tenant_name` (`tenantId`, `name`),
  CONSTRAINT `fk_customer_sources_tenant`
    FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------
-- users — console operators (not payers)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id`           INT           NOT NULL AUTO_INCREMENT,
  `email`        VARCHAR(255)  NOT NULL,
  `passwordHash` VARCHAR(255)  NOT NULL,
  `name`         VARCHAR(255)  NULL,
  -- 'admin' | 'staff'
  `role`         VARCHAR(255)  NOT NULL DEFAULT 'staff',
  `createdAt`    DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`    DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                               ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------
-- customers — local mirror of Stripe customers, scoped per tenant
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `customers` (
  `id`               INT           NOT NULL AUTO_INCREMENT,
  `tenantId`         INT           NOT NULL,
  `stripeCustomerId` VARCHAR(255)  NOT NULL,
  `email`            VARCHAR(255)  NOT NULL,
  `name`             VARCHAR(255)  NULL,
  `phone`            VARCHAR(255)  NULL,
  `createdAt`        DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`        DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                   ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customers_stripe_id` (`stripeCustomerId`),
  KEY `ix_customers_email` (`email`),
  KEY `ix_customers_tenant` (`tenantId`),
  CONSTRAINT `fk_customers_tenant`
    FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------
-- payments — the root object of the whole service
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `payments` (
  `id`                      INT           NOT NULL AUTO_INCREMENT,
  `tenantId`                INT           NOT NULL,
  -- The calling platform's own id: policy number, invoice number, etc.
  -- Not unique: a platform may take several payments against one record.
  `externalReference`       VARCHAR(255)  NULL,
  `description`             VARCHAR(255)  NULL,
  -- Optional: a payment can stand entirely on its own
  `customerId`              INT           NULL,
  `customerEmail`           VARCHAR(255)  NULL,
  `customerName`            VARCHAR(255)  NULL,
  `stripeCheckoutSessionId` VARCHAR(255)  NULL,
  `stripePaymentIntentId`   VARCHAR(255)  NULL,
  -- 'card' | 'us_bank_account' | 'acss_debit'
  `paymentMethodType`       VARCHAR(255)  NOT NULL,
  -- 'automatic' | 'manual'
  `captureMethod`           VARCHAR(255)  NOT NULL DEFAULT 'automatic',
  `amount`                  INT           NOT NULL,
  -- Held but not yet taken; non-zero only while status = requires_capture
  `amountCapturable`        INT           NOT NULL DEFAULT 0,
  -- Actually captured; differs from `amount` on a partial capture
  `amountReceived`          INT           NOT NULL DEFAULT 0,
  `amountRefunded`          INT           NOT NULL DEFAULT 0,
  `currency`                VARCHAR(255)  NOT NULL DEFAULT 'usd',
  -- Mirrors Stripe PaymentIntent.status, plus a local 'failed'
  `status`                  VARCHAR(255)  NOT NULL DEFAULT 'requires_payment_method',
  `failureReason`           TEXT          NULL,
  `createdAt`               DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`               DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                          ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  -- MySQL permits many NULLs in a unique index, so these stay unique for
  -- real ids while a payment that has only one of the two is still valid.
  UNIQUE KEY `uq_payments_session` (`stripeCheckoutSessionId`),
  UNIQUE KEY `uq_payments_intent`  (`stripePaymentIntentId`),
  KEY `ix_payments_tenant_created` (`tenantId`, `createdAt`),
  KEY `ix_payments_tenant_extref`  (`tenantId`, `externalReference`),
  KEY `ix_payments_customer`       (`customerId`),
  KEY `ix_payments_status`         (`status`),
  CONSTRAINT `fk_payments_tenant`
    FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`),
  CONSTRAINT `fk_payments_customer`
    FOREIGN KEY (`customerId`) REFERENCES `customers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------
-- invoices — documents from the source platforms
-- paymentId is nullable: upload first, attach to a payment after.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `invoices` (
  `id`               INT           NOT NULL AUTO_INCREMENT,
  `tenantId`         INT           NOT NULL,
  `paymentId`        INT           NULL,
  `invoiceNumber`    VARCHAR(255)  NULL,
  -- Filename as the uploader saw it; never used to build a path
  `originalFilename` VARCHAR(255)  NULL,
  `mimeType`         VARCHAR(255)  NULL,
  `sizeBytes`        INT           NOT NULL DEFAULT 0,
  -- Opaque UUID filename on disk, generated by us
  `storageKey`       VARCHAR(255)  NULL,
  -- Alternative to storing the file: a link to it in the source system
  `externalUrl`      VARCHAR(255)  NULL,
  `uploadedByUserId` INT           NULL,
  `createdAt`        DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `ix_invoices_tenant_created` (`tenantId`, `createdAt`),
  KEY `ix_invoices_payment`        (`paymentId`),
  CONSTRAINT `fk_invoices_tenant`
    FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`),
  -- Deleting a payment removes its paperwork with it
  CONSTRAINT `fk_invoices_payment`
    FOREIGN KEY (`paymentId`) REFERENCES `payments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------
-- refunds
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `refunds` (
  `id`             INT           NOT NULL AUTO_INCREMENT,
  `tenantId`       INT           NOT NULL,
  `paymentId`      INT           NOT NULL,
  `stripeRefundId` VARCHAR(255)  NOT NULL,
  `amount`         INT           NOT NULL,
  `currency`       VARCHAR(255)  NOT NULL DEFAULT 'usd',
  -- 'duplicate' | 'fraudulent' | 'requested_by_customer'
  `reason`         VARCHAR(255)  NULL,
  -- Internal note from the console; never sent to Stripe
  `note`           TEXT          NULL,
  `issuedByUserId` INT           NULL,
  `status`         VARCHAR(255)  NOT NULL DEFAULT 'pending',
  `createdAt`      DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`      DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                 ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_refunds_stripe_id` (`stripeRefundId`),
  KEY `ix_refunds_tenant_created` (`tenantId`, `createdAt`),
  KEY `ix_refunds_payment`        (`paymentId`),
  CONSTRAINT `fk_refunds_payment`
    FOREIGN KEY (`paymentId`) REFERENCES `payments` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------
-- payouts — your Stripe balance moving to your own bank account.
-- Account-wide, not per tenant: the balance is not split by platform.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `payouts` (
  `id`             INT           NOT NULL AUTO_INCREMENT,
  `stripePayoutId` VARCHAR(255)  NOT NULL,
  `amount`         INT           NOT NULL,
  `currency`       VARCHAR(255)  NOT NULL DEFAULT 'usd',
  `status`         VARCHAR(255)  NOT NULL DEFAULT 'pending',
  `arrivalDate`    DATETIME      NULL,
  -- 'standard' | 'instant'
  `method`         VARCHAR(255)  NOT NULL DEFAULT 'standard',
  `createdAt`      DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`      DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                 ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payouts_stripe_id` (`stripePayoutId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------
-- webhook_deliveries — outbound notifications to the source platforms
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `webhook_deliveries` (
  `id`             INT           NOT NULL AUTO_INCREMENT,
  `tenantId`       INT           NOT NULL,
  -- e.g. 'payment.succeeded', 'refund.updated'
  `eventType`      VARCHAR(255)  NOT NULL,
  -- The exact bytes we sign and send; kept so a delivery can be replayed
  `payload`        TEXT          NOT NULL,
  -- 'pending' | 'delivered' | 'failed'
  `status`         VARCHAR(255)  NOT NULL DEFAULT 'pending',
  `attempts`       INT           NOT NULL DEFAULT 0,
  `lastStatusCode` INT           NULL,
  `lastError`      TEXT          NULL,
  `nextAttemptAt`  DATETIME      NULL,
  `createdAt`      DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`      DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                 ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  -- Drives the retry sweep, which polls for due deliveries every minute
  KEY `ix_deliveries_status_next` (`status`, `nextAttemptAt`),
  KEY `ix_deliveries_tenant`      (`tenantId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------
-- processed_events — inbound Stripe event de-duplication.
-- Stripe retries on any non-2xx and can redeliver after success, so the
-- unique eventId is what makes every handler exactly-once.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `processed_events` (
  `id`          INT           NOT NULL AUTO_INCREMENT,
  `eventId`     VARCHAR(255)  NOT NULL,
  `eventType`   VARCHAR(255)  NOT NULL,
  `processedAt` DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_processed_events_event_id` (`eventId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


SET FOREIGN_KEY_CHECKS = 1;


-- ---------------------------------------------------------------
-- Legacy: the orders module was removed. Payments now carry their own
-- amount and an externalReference instead. Drop it once you have
-- confirmed there is nothing in it you still need.
-- ---------------------------------------------------------------
-- DROP TABLE IF EXISTS `orders`;
