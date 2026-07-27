'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
	buildPhpMovePlan,
	ensureMovedTypeImports,
	getPhpDeclaredTypes,
	getPhpPotentialTypeNames,
	replacePhpTypeReferences,
	resolvePsr4Namespace,
} = require('../phpMove');

test('resolves a namespace from the longest matching Composer PSR-4 path', () => {
	const composerJson = {
		autoload: {
			'psr-4': {
				'App\\': 'app/',
				'Domain\\': ['src/', 'domain/'],
			},
		},
		'autoload-dev': {
			'psr-4': {
				'Tests\\': 'tests/',
			},
		},
	};

	assert.equal(
		resolvePsr4Namespace(composerJson, '/workspace', '/workspace/app/Services/Billing/InvoiceService.php'),
		'App\\Services\\Billing'
	);
	assert.equal(
		resolvePsr4Namespace(composerJson, '/workspace', '/workspace/tests/Feature/BillingTest.php'),
		'Tests\\Feature'
	);
	assert.equal(
		resolvePsr4Namespace(composerJson, '/workspace', '/elsewhere/InvoiceService.php'),
		undefined
	);
});

test('finds named PHP declarations and ignores anonymous classes', () => {
	const source = `<?php
namespace App\\Old;

// class CommentedOut {}
/* interface AlsoCommentedOut {} */
$example = 'trait InsideAString {}';
final class InvoiceService {}
interface CreatesInvoices {}
trait HasInvoices {}
enum InvoiceState: string {}
$anonymous = new class extends InvoiceService {};
`;

	assert.deepEqual(
		getPhpDeclaredTypes(source).map((declaration) => declaration.name),
		['InvoiceService', 'CreatesInvoices', 'HasInvoices', 'InvoiceState']
	);
});

test('adds a namespace after a leading strict-types declaration', () => {
	const source = `<?php

declare(strict_types=1);

final class InvoiceService {}
`;
	const plan = buildPhpMovePlan(source, 'App\\Services');

	assert.match(
		plan.updatedSource,
		/^<\?php\n\ndeclare\(strict_types=1\);\n\nnamespace App\\Services;\n\nfinal class/
	);
});

test('builds a move plan that updates the namespace and every declared type FQN', () => {
	const source = `<?php

namespace App\\Old;

class InvoiceService {}
interface CreatesInvoices {}
`;
	const plan = buildPhpMovePlan(source, 'App\\Services\\Billing');

	assert.equal(plan.oldNamespace, 'App\\Old');
	assert.equal(plan.newNamespace, 'App\\Services\\Billing');
	assert.match(plan.updatedSource, /namespace App\\Services\\Billing;/);
	assert.deepEqual(plan.replacements, [
		{
			oldFqn: 'App\\Old\\InvoiceService',
			newFqn: 'App\\Services\\Billing\\InvoiceService',
		},
		{
			oldFqn: 'App\\Old\\CreatesInvoices',
			newFqn: 'App\\Services\\Billing\\CreatesInvoices',
		},
	]);
});

test('updates exact fully-qualified PHP references without touching longer class names', () => {
	const source = `<?php
use App\\Old\\InvoiceService;

$class = \\App\\Old\\InvoiceService::class;
$other = App\\Old\\InvoiceServiceFactory::class;
`;
	const updated = replacePhpTypeReferences(source, [
		{
			oldFqn: 'App\\Old\\InvoiceService',
			newFqn: 'App\\Services\\InvoiceService',
		},
	]);

	assert.match(updated, /use App\\Services\\InvoiceService;/);
	assert.match(updated, /\\App\\Services\\InvoiceService::class/);
	assert.match(updated, /App\\Old\\InvoiceServiceFactory::class/);
});

test('moves a class out of a grouped use declaration', () => {
	const source = `<?php
use App\\Old\\{InvoiceService, OtherService as Other};
`;
	const updated = replacePhpTypeReferences(source, [
		{
			oldFqn: 'App\\Old\\InvoiceService',
			newFqn: 'App\\Services\\InvoiceService',
		},
	]);

	assert.match(updated, /use App\\Old\\{OtherService as Other};/);
	assert.match(updated, /use App\\Services\\InvoiceService;/);
	assert.doesNotMatch(updated, /App\\Old\\{InvoiceService/);
});

test('adds an import for short references in files that remain in the old namespace', () => {
	const source = `<?php
namespace App\\Old;

final class InvoiceController
{
	public function __construct(private InvoiceService $service) {}
}
`;
	const updated = ensureMovedTypeImports(source, 'App\\Old', [
		{
			oldFqn: 'App\\Old\\InvoiceService',
			newFqn: 'App\\Services\\InvoiceService',
		},
	]);

	assert.match(updated, /namespace App\\Old;\n\nuse App\\Services\\InvoiceService;/);
});

test('finds possible same-namespace dependencies without comments, imports, or declarations', () => {
	const source = `<?php
namespace App\\Old;

use Vendor\\Package\\ExternalService;

// CommentOnlyType
final class InvoiceService
{
	/** @return LegacyInvoice */
	public function run(InvoiceRepository $repository): ExternalService {}
}
`;

	assert.deepEqual(
		getPhpPotentialTypeNames(source),
		['LegacyInvoice', 'InvoiceRepository']
	);
});
