# Interface Review

## Scope

Review primary navigation, responsive layouts, keyboard access, form errors
and recovery messages. Preserve existing business rules and tenant permissions.

## Changes

- Add a keyboard-visible skip link that moves focus past navigation to the page
  content. Input and button focus remains visible.
- Allow long company names to wrap and flex children to shrink.
- Remove fieldset and field minimum-width constraints that can exceed narrow
  viewports. Do not hide overflow to conceal inaccessible content.
- Identify company module links as a named navigation landmark.
- Announce customer/product picker loading through a polite status region.
- Provide an application-level unavailable-page message with a recovery link.
  The existing tenant-specific unavailable screen remains in place.
- Provide a generic page-error boundary with Next.js retry support and a link
  back to company selection. Do not display exception details or encourage
  resubmitting a potentially completed business operation.

Existing pending states, field labels, validation descriptions and empty-list
messages are retained.

## Verification

The interface browser suite checks:

- Keyboard skip-link activation and visible input focus.
- Missing routes and unavailable tenant navigation without tenant information.
- Thirteen core screens at 320, 375 and 1280 pixels, with a long company name.
- No document-width overflow and accessible names for form fields.
- Product/order empty states and customer field error associations.
- Customer picker failure, loading announcement, disabled selection and retry.

The mobile company workspace is also inspected visually using a disposable
test-fixture screenshot. Test artifacts remain outside Git.

The production build validates the error-boundary integration. Forced server
failure and recovery through that boundary are not covered by this browser
suite; include them in a future fault-injection exercise.

This is a targeted interface review, not a complete WCAG certification or a
review of every data-heavy order-detail combination. Existing domain browser
tests continue to cover populated customer, product, stock and order flows.

## Staging Acceptance

After CI, merge and delivery:

1. Navigate the principal screens on desktop and a narrow viewport.
2. Use Tab to reveal the skip link, activate it and reach the page controls.
3. Check customer validation and loading/error feedback.
4. Open an invalid URL and verify a useful recovery link.
5. Confirm administrator and employee navigation still respects permissions.
