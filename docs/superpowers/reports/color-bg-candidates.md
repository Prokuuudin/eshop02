# Phase 2 — Layered background candidates

Review each site and apply the suggested token by hand. Page shell -> `bg-background`,
elevated card -> `bg-card`, subtle/hover block -> `bg-muted`/`bg-secondary`.

| Count | Pattern | Suggested | File |
|------:|---------|-----------|------|
| 15 | `bg-white dark:bg-gray-800` | bg-card | app\admin\blog\page.tsx |
| 13 | `bg-gray-950` | bg-background | app\admin\returns\page.tsx |
| 12 | `bg-gray-200 dark:bg-gray-700` | bg-secondary | components\OrderCardSkeleton.tsx |
| 8 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\bonus\page.tsx |
| 7 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\marketing\analytics\page.tsx |
| 7 | `bg-gray-950` | bg-background | app\admin\orders\page.tsx |
| 7 | `bg-white dark:bg-gray-800` | bg-card | app\checkout\page.tsx |
| 7 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\order\[id]\page.tsx |
| 6 | `bg-white dark:bg-gray-800` | bg-card | app\admin\content\banners\page.tsx |
| 6 | `bg-gray-200 dark:bg-gray-700` | bg-secondary | app\admin\design-system\page.tsx |
| 6 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\orders\page.tsx |
| 6 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\page.tsx |
| 6 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\returns\page.tsx |
| 6 | `bg-gray-200 dark:bg-gray-700` | bg-secondary | components\account\AccountSectionSkeleton.tsx |
| 5 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\content\banners\page.tsx |
| 5 | `bg-gray-100 dark:bg-gray-800` | bg-muted | app\admin\content\banners\page.tsx |
| 5 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\content\page.tsx |
| 5 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\orders\new\page.tsx |
| 5 | `bg-gray-200 dark:bg-gray-700` | bg-secondary | components\ProductCardSkeleton.tsx |
| 4 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\analytics\page.tsx |
| 4 | `bg-gray-50 dark:bg-gray-800` | bg-muted | app\admin\analytics\page.tsx |
| 4 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\config\locale\page.tsx |
| 4 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\content\media\page.tsx |
| 4 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\customers\profile\page.tsx |
| 4 | `bg-gray-50 dark:bg-gray-800` | bg-muted | app\admin\import\page.tsx |
| 4 | `bg-gray-950` | bg-background | app\admin\rfq\page.tsx |
| 4 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\system\admin-log\page.tsx |
| 4 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\checkout\page.tsx |
| 4 | `bg-white dark:bg-gray-800` | bg-card | app\contact\page.tsx |
| 4 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\admin\AdminGate.tsx |
| 4 | `bg-gray-200 dark:bg-gray-700` | bg-secondary | components\AuditLogViewer.tsx |
| 4 | `bg-gray-200 dark:bg-gray-700` | bg-secondary | components\BrandCardSkeleton.tsx |
| 4 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\CartDrawer.tsx |
| 4 | `bg-gray-50 dark:bg-gray-800` | bg-muted | components\InvoiceViewer.tsx |
| 4 | `bg-white dark:bg-gray-800` | bg-card | components\ProductFilter.tsx |
| 4 | `bg-white dark:bg-gray-800` | bg-card | components\Reviews.tsx |
| 3 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\account\integrations\webhooks\page.tsx |
| 3 | `bg-white dark:bg-gray-800` | bg-card | app\admin\accounts\page.tsx |
| 3 | `bg-gray-50 dark:bg-gray-800` | bg-muted | app\admin\content\media\page.tsx |
| 3 | `bg-gray-100 dark:bg-gray-800` | bg-muted | app\admin\content\media\page.tsx |
| 3 | `bg-gray-50 dark:bg-gray-800` | bg-muted | app\admin\customers\segments\page.tsx |
| 3 | `bg-gray-100 dark:bg-gray-800` | bg-muted | app\admin\customers\segments\page.tsx |
| 3 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\import\page.tsx |
| 3 | `bg-gray-50 dark:bg-gray-800` | bg-muted | app\admin\returns\page.tsx |
| 3 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\cart\page.tsx |
| 3 | `bg-gray-950` | bg-background | app\request-quote\page.tsx |
| 3 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\AuditLogViewer.tsx |
| 3 | `bg-white dark:bg-gray-800` | bg-card | components\auth\RegisterForm.tsx |
| 2 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\accounts\page.tsx |
| 2 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\client-barcodes\page.tsx |
| 2 | `bg-white dark:bg-gray-800` | bg-card | app\admin\client-barcodes\page.tsx |
| 2 | `bg-gray-50 dark:bg-gray-800` | bg-muted | app\admin\config\locale\page.tsx |
| 2 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\config\shipping\page.tsx |
| 2 | `bg-gray-50 dark:bg-gray-800` | bg-muted | app\admin\content\page.tsx |
| 2 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\customers\segments\page.tsx |
| 2 | `bg-gray-200 dark:bg-gray-700` | bg-secondary | app\admin\customers\segments\page.tsx |
| 2 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\help\faq\page.tsx |
| 2 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\help\onboarding\page.tsx |
| 2 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\marketing\campaigns\page.tsx |
| 2 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\marketing\discounts\page.tsx |
| 2 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\marketing\showcases\page.tsx |
| 2 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\notifications\send\page.tsx |
| 2 | `bg-gray-50 dark:bg-gray-800` | bg-muted | app\admin\orders\new\page.tsx |
| 2 | `bg-gray-950` | bg-background | app\admin\orders\new\page.tsx |
| 2 | `bg-gray-50 dark:bg-gray-800` | bg-muted | app\admin\orders\page.tsx |
| 2 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\products\duplicates\page.tsx |
| 2 | `bg-gray-100 dark:bg-gray-800` | bg-muted | app\admin\products\duplicates\page.tsx |
| 2 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\rfq\page.tsx |
| 2 | `bg-gray-50 dark:bg-gray-800` | bg-muted | app\admin\system\admin-log\page.tsx |
| 2 | `bg-white dark:bg-gray-800` | bg-card | app\auth\reset-password\page.tsx |
| 2 | `bg-white dark:bg-gray-800` | bg-card | app\delivery-payment\page.tsx |
| 2 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\request-quote\page.tsx |
| 2 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\account\AccountSubscriptionsSection.tsx |
| 2 | `bg-white dark:bg-gray-800` | bg-card | components\account\ForceChangePasswordModal.tsx |
| 2 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\admin\AdminGlobalSearch.tsx |
| 2 | `bg-white dark:bg-gray-800` | bg-card | components\AuditLogViewer.tsx |
| 2 | `bg-white dark:bg-gray-800` | bg-card | components\auth\LoginForm.tsx |
| 2 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\auth\RegisterNoCardForm.tsx |
| 2 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\B2BChat.tsx |
| 2 | `bg-gray-950` | bg-background | components\B2BChat.tsx |
| 2 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\Categories.tsx |
| 2 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\CreditCalculator.tsx |
| 2 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\FAQSection.tsx |
| 2 | `bg-white dark:bg-gray-800` | bg-card | components\InvoiceList.tsx |
| 2 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\OrderHistory.tsx |
| 2 | `bg-gray-100 dark:bg-gray-800` | bg-muted | components\ProductCodes.tsx |
| 2 | `bg-gray-200 dark:bg-gray-700` | bg-secondary | components\Products.tsx |
| 2 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\Reviews.tsx |
| 2 | `bg-gray-50 dark:bg-gray-900` | bg-muted OR bg-background | components\SubscriptionWidget.tsx |
| 2 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\TopCategories.tsx |
| 2 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\TopProducts.tsx |
| 1 | `bg-gray-100 dark:bg-gray-800` | bg-muted | app\account\addresses\page.tsx |
| 1 | `bg-gray-50 dark:bg-gray-800` | bg-muted | app\account\audit-logs\page.tsx |
| 1 | `bg-gray-50 dark:bg-gray-800` | bg-muted | app\account\integrations\webhooks\page.tsx |
| 1 | `bg-gray-950` | bg-background | app\account\integrations\webhooks\page.tsx |
| 1 | `bg-gray-100 dark:bg-gray-700` | bg-secondary | app\account\invoices\page.tsx |
| 1 | `bg-gray-100 dark:bg-gray-800` | bg-muted | app\account\templates\page.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\blog\page.tsx |
| 1 | `bg-white dark:bg-gray-800` | bg-card | app\admin\bonus\page.tsx |
| 1 | `bg-gray-50 dark:bg-gray-800` | bg-muted | app\admin\bonus\page.tsx |
| 1 | `bg-gray-100 dark:bg-gray-800` | bg-muted | app\admin\bonus\page.tsx |
| 1 | `bg-gray-50 dark:bg-gray-800` | bg-muted | app\admin\client-barcodes\page.tsx |
| 1 | `bg-white dark:bg-gray-800` | bg-card | app\admin\config\locale\page.tsx |
| 1 | `bg-white dark:bg-gray-800` | bg-card | app\admin\config\shipping\page.tsx |
| 1 | `bg-gray-50 dark:bg-gray-800` | bg-muted | app\admin\content\banners\page.tsx |
| 1 | `bg-white dark:bg-gray-800` | bg-card | app\admin\customers\segments\page.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\design-system\page.tsx |
| 1 | `bg-white dark:bg-gray-800` | bg-card | app\admin\design-system\page.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\help\knowledge\page.tsx |
| 1 | `bg-gray-50 dark:bg-gray-900` | bg-muted OR bg-background | app\admin\help\knowledge\page.tsx |
| 1 | `bg-gray-50 dark:bg-gray-800` | bg-muted | app\admin\help\onboarding\page.tsx |
| 1 | `bg-gray-200 dark:bg-gray-700` | bg-secondary | app\admin\help\onboarding\page.tsx |
| 1 | `bg-gray-100 dark:bg-gray-800` | bg-muted | app\admin\import\page.tsx |
| 1 | `bg-gray-50 dark:bg-gray-800` | bg-muted | app\admin\marketing\analytics\page.tsx |
| 1 | `bg-gray-100 dark:bg-gray-800` | bg-muted | app\admin\marketing\analytics\page.tsx |
| 1 | `bg-white dark:bg-gray-800` | bg-card | app\admin\marketing\campaigns\page.tsx |
| 1 | `bg-white dark:bg-gray-800` | bg-card | app\admin\marketing\discounts\page.tsx |
| 1 | `bg-white dark:bg-gray-800` | bg-card | app\admin\marketing\showcases\page.tsx |
| 1 | `bg-white dark:bg-gray-800` | bg-card | app\admin\notifications\send\page.tsx |
| 1 | `bg-white dark:bg-gray-800` | bg-card | app\admin\orders\page.tsx |
| 1 | `bg-gray-100 dark:bg-gray-800` | bg-muted | app\admin\orders\page.tsx |
| 1 | `bg-gray-50 dark:bg-gray-800` | bg-muted | app\admin\page.tsx |
| 1 | `bg-gray-100 dark:bg-gray-800` | bg-muted | app\admin\page.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\admin\products\[id]\ProductEditPageContent.tsx |
| 1 | `bg-gray-200 dark:bg-gray-700` | bg-secondary | app\admin\returns\page.tsx |
| 1 | `bg-white dark:bg-gray-800` | bg-card | app\admin\reviews\page.tsx |
| 1 | `bg-gray-50 dark:bg-gray-800` | bg-muted | app\admin\rfq\page.tsx |
| 1 | `bg-gray-200 dark:bg-gray-700` | bg-secondary | app\admin\rfq\page.tsx |
| 1 | `bg-gray-100 dark:bg-gray-800` | bg-muted | app\admin\sales\analytics\page.tsx |
| 1 | `bg-gray-100 dark:bg-gray-800` | bg-muted | app\admin\sales\breakdown\page.tsx |
| 1 | `bg-white dark:bg-gray-800` | bg-card | app\admin\stock-alerts\page.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\auth\admin-setup\page.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\auth\forgot-password\page.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\auth\reset-password\page.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | app\blog\page.tsx |
| 1 | `bg-gray-50 dark:bg-gray-800` | bg-muted | app\blog\page.tsx |
| 1 | `bg-gray-100 dark:bg-gray-800` | bg-muted | app\cart\page.tsx |
| 1 | `bg-gray-50 dark:bg-gray-800` | bg-muted | app\request-quote\page.tsx |
| 1 | `bg-gray-100 dark:bg-gray-800` | bg-muted | app\request-quote\page.tsx |
| 1 | `bg-gray-100 dark:bg-gray-800` | bg-muted | components\account\AccountAddressesSection.tsx |
| 1 | `bg-gray-950` | bg-background | components\account\AccountAddressesWidget.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\account\AccountNotificationsSection.tsx |
| 1 | `bg-gray-50 dark:bg-gray-800` | bg-muted | components\account\AccountNotificationsSection.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\account\AccountPageHero.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\account\AccountSectionSkeleton.tsx |
| 1 | `bg-white dark:bg-gray-800` | bg-card | components\account\AccountSubscriptionsSection.tsx |
| 1 | `bg-gray-100 dark:bg-gray-800` | bg-muted | components\account\AccountSubscriptionsSection.tsx |
| 1 | `bg-gray-950` | bg-background | components\account\AccountTemplatesWidget.tsx |
| 1 | `bg-gray-950` | bg-background | components\account\AccountToolsSection.tsx |
| 1 | `bg-gray-950` | bg-background | components\account\AccountViewedProductsWidget.tsx |
| 1 | `bg-gray-950` | bg-background | components\account\AccountWishlistWidget.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\account\ForceChangePasswordModal.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\account\WelcomeModal.tsx |
| 1 | `bg-white dark:bg-gray-800` | bg-card | components\AddToCartButton.tsx |
| 1 | `bg-gray-200 dark:bg-gray-700` | bg-secondary | components\AddToCartButton.tsx |
| 1 | `bg-gray-100 dark:bg-gray-800` | bg-muted | components\admin\AdminAccountDashboard.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\admin\AdminTableSkeleton.tsx |
| 1 | `bg-gray-50 dark:bg-gray-800` | bg-muted | components\admin\AdminTableSkeleton.tsx |
| 1 | `bg-gray-200 dark:bg-gray-700` | bg-secondary | components\admin\AdminTableSkeleton.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\admin\OrderInvoiceModal.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\admin\products\ProductCard.tsx |
| 1 | `bg-gray-50 dark:bg-gray-800` | bg-muted | components\admin\products\ProductCard.tsx |
| 1 | `bg-gray-100 dark:bg-gray-800` | bg-muted | components\admin\products\ProductCard.tsx |
| 1 | `bg-gray-100 dark:bg-gray-700` | bg-secondary | components\admin\products\ProductCard.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\admin\products\ProductPreviewCard.tsx |
| 1 | `bg-white dark:bg-gray-800` | bg-card | components\admin\products\ProductPreviewCard.tsx |
| 1 | `bg-gray-100 dark:bg-gray-800` | bg-muted | components\admin\products\ProductPreviewCard.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\admin\products\ProductsToolbar.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\admin\products\ProductTable.tsx |
| 1 | `bg-white dark:bg-gray-800` | bg-card | components\admin\products\ProductTable.tsx |
| 1 | `bg-gray-50 dark:bg-gray-800` | bg-muted | components\admin\products\ProductTable.tsx |
| 1 | `bg-gray-100 dark:bg-gray-800` | bg-muted | components\admin\products\ProductTable.tsx |
| 1 | `bg-gray-100 dark:bg-gray-700` | bg-secondary | components\admin\products\ProductTable.tsx |
| 1 | `bg-gray-50 dark:bg-gray-800` | bg-muted | components\AuditLogViewer.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\auth\ForgotPasswordForm.tsx |
| 1 | `bg-white dark:bg-gray-800` | bg-card | components\auth\ForgotPasswordForm.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\auth\LoginForm.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\auth\RegisterForm.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\Benefits.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\BlogCard.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\BlogPostContent.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\BrandCardSkeleton.tsx |
| 1 | `bg-gray-50 dark:bg-gray-800` | bg-muted | components\BulkPricing.tsx |
| 1 | `bg-gray-950` | bg-background | components\CartDrawer.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\Header.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\HeaderSearch.tsx |
| 1 | `bg-white dark:bg-gray-800` | bg-card | components\HeaderSearch.tsx |
| 1 | `bg-gray-50 dark:bg-gray-800` | bg-muted | components\HeaderSearch.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\Hero.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\InvoiceViewer.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\LanguageSwitcher.tsx |
| 1 | `bg-gray-50 dark:bg-gray-800` | bg-muted | components\LanguageSwitcher.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\MetricCard.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\MobileMenu.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\OrderCardSkeleton.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\ProductCard.tsx |
| 1 | `bg-gray-100 dark:bg-gray-800` | bg-muted | components\ProductCard.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\ProductCardSkeleton.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\ProductFilter.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\ProductListRow.tsx |
| 1 | `bg-gray-100 dark:bg-gray-800` | bg-muted | components\ProductListRow.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\Products.tsx |
| 1 | `bg-gray-50 dark:bg-gray-900` | bg-muted OR bg-background | components\ProductSpecs.tsx |
| 1 | `bg-gray-50 dark:bg-gray-900` | bg-muted OR bg-background | components\Reviews.tsx |
| 1 | `bg-gray-200 dark:bg-gray-700` | bg-secondary | components\Reviews.tsx |
| 1 | `bg-white dark:bg-gray-800` | bg-card | components\SubscriptionWidget.tsx |
| 1 | `bg-gray-100 dark:bg-gray-800` | bg-muted | components\ThemeToggle.tsx |
| 1 | `bg-gray-200 dark:bg-gray-700` | bg-secondary | components\TopCategories.tsx |
| 1 | `bg-gray-50 dark:bg-gray-800` | bg-muted | components\TopProducts.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\ui\tooltip.tsx |
| 1 | `bg-white dark:bg-gray-900` | bg-card (elevated) OR bg-background (page) | components\UserMenu.tsx |

Total sites: 447