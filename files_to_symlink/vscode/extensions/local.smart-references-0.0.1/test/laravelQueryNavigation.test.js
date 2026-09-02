const test = require('node:test');
const assert = require('node:assert/strict');

const {
	findRelationMethodRange,
	getEloquentRelationAtOffset,
	getRelatedModelFromRelation,
} = require('../laravelQueryNavigation');

// Cursor in the middle of the first occurrence of `needle`, which every case below uses to stand for
// "the user pressed Cmd+B on this relation name".
function at(source, needle) {
	return source.indexOf(needle) + Math.floor(needle.length / 2);
}

// ---- chain head written as a class -------------------------------------------------------------

test('resolves a relation eager-loaded from a class-headed chain', () => {
	const source = "$rows = FacebookAdAccount::query()->with('metaToken')->get();";

	assert.deepEqual(getEloquentRelationAtOffset(source, at(source, 'metaToken')), {
		headClass: 'FacebookAdAccount',
		segments: ['metaToken'],
		segmentIndex: 0,
	});
});

test('reads the head through intervening calls, comments and a multi-line chain', () => {
	const source = [
		'$rows = FacebookAdAccount::query()',
		"    ->where('status', FBAdAccountStatusEnum::active)",
		'    // One query for the credentials rather than one per account.',
		"    ->with('metaToken')",
		'    ->get();',
	].join('\n');

	assert.equal(getEloquentRelationAtOffset(source, at(source, 'metaToken')).headClass, 'FacebookAdAccount');
});

test('a class named inside an earlier argument does not become the head', () => {
	const source = "$rows = FacebookAdAccount::query()->where('status', StatusEnum::active)->with('metaToken')->get();";

	assert.equal(getEloquentRelationAtOffset(source, at(source, 'metaToken')).headClass, 'FacebookAdAccount');
});

test('recognizes relation names inside an array argument', () => {
	const source = "Order::query()->with(['customer', 'lines'])->get();";

	assert.equal(getEloquentRelationAtOffset(source, at(source, 'lines')).headClass, 'Order');
	assert.equal(getEloquentRelationAtOffset(source, at(source, 'lines')).segments[0], 'lines');
});

test('covers the wider relation-naming family, not just with()', () => {
	for (const method of ['withCount', 'whereHas', 'loadMissing', 'withSum', 'orWhereDoesntHave']) {
		const source = `Order::query()->${method}('lines')->get();`;

		assert.equal(
			getEloquentRelationAtOffset(source, at(source, 'lines')).segments[0],
			'lines',
			`${method} should name a relation`,
		);
	}
});

// ---- chain head written as $this in a builder ---------------------------------------------------

test('resolves $this in a builder through the model generic it declares', () => {
	const source = [
		'<?php',
		'namespace App\\Builders;',
		'/**',
		' * @extends Builder<FacebookAdAccount>',
		' */',
		'class FacebookAdAccountQueryBuilder extends Builder',
		'{',
		'    public function activeForSync(?int $id): self',
		'    {',
		'        return $this',
		"            ->where('status', FBAdAccountStatusEnum::active)",
		"            ->with('metaToken')",
		"            ->when($id !== null, fn ($query) => $query->whereKey($id));",
		'    }',
		'}',
	].join('\n');

	assert.deepEqual(getEloquentRelationAtOffset(source, at(source, 'metaToken')), {
		headClass: 'FacebookAdAccount',
		segments: ['metaToken'],
		segmentIndex: 0,
	});
});

test('a builder without the generic is left alone rather than guessed from its class name', () => {
	const source = [
		'class FacebookAdAccountQueryBuilder extends Builder',
		'{',
		"    public function activeForSync(): self { return $this->with('metaToken'); }",
		'}',
	].join('\n');

	assert.equal(getEloquentRelationAtOffset(source, at(source, 'metaToken')), undefined);
});

// ---- dotted paths --------------------------------------------------------------------------------

test('reports which dotted segment the cursor is on', () => {
	const source = "Order::query()->with('customer.company')->get();";

	assert.deepEqual(getEloquentRelationAtOffset(source, at(source, 'customer')), {
		headClass: 'Order',
		segments: ['customer', 'company'],
		segmentIndex: 0,
	});
	assert.equal(getEloquentRelationAtOffset(source, at(source, 'company')).segmentIndex, 1);
});

// ---- things that must NOT resolve -----------------------------------------------------------------

test('a chain headed by a variable is not guessed at', () => {
	const source = "$query->with('metaToken')->get();";

	assert.equal(getEloquentRelationAtOffset(source, at(source, 'metaToken')), undefined);
});

test('a nested closure does not inherit the outer chain head', () => {
	const source = "Order::query()->when($flag, fn ($q) => $q->with('lines'))->get();";

	assert.equal(getEloquentRelationAtOffset(source, at(source, 'lines')), undefined);
});

test('session flashes and view data are not relations', () => {
	const flash = "return redirect()->route('home')->with('status', 'Saved');";
	const view = "return view('orders.index')->with('orders', $orders);";

	assert.equal(getEloquentRelationAtOffset(flash, at(flash, 'status')), undefined);
	assert.equal(getEloquentRelationAtOffset(view, at(view, 'orders.index')), undefined);
});

test('an unrelated string argument is not a relation', () => {
	const source = "Order::query()->where('metaToken', 1)->get();";

	assert.equal(getEloquentRelationAtOffset(source, at(source, 'metaToken')), undefined);
});

test('a relation name that is not a plain identifier is refused', () => {
	const source = "Order::query()->with('lines->items')->get();";

	assert.equal(getEloquentRelationAtOffset(source, at(source, 'lines')), undefined);
});

// ---- reading the model side -------------------------------------------------------------------------

test('locates the relation method declaration by name', () => {
	const source = [
		'class FacebookAdAccount extends Model',
		'{',
		'    public function metaToken(): BelongsTo',
		'    {',
		'        return $this->belongsTo(MetaToken::class);',
		'    }',
		'}',
	].join('\n');
	const range = findRelationMethodRange(source, 'metaToken');

	assert.equal(source.slice(range.start, range.end), 'metaToken');
	// The declaration, not the call inside the body.
	assert.equal(source.slice(range.start - 9, range.start), 'function ');
});

test('reads the related model out of the relation body so a dotted path can be followed', () => {
	const source = [
		'class Order extends Model',
		'{',
		'    public function customer(): BelongsTo',
		'    {',
		'        return $this->belongsTo(Customer::class, "customer_id");',
		'    }',
		'',
		'    public function lines(): HasMany',
		'    {',
		'        return $this->hasMany(OrderLine::class);',
		'    }',
		'}',
	].join('\n');

	assert.equal(getRelatedModelFromRelation(source, 'customer'), 'Customer');
	assert.equal(getRelatedModelFromRelation(source, 'lines'), 'OrderLine');
});

test('a relation naming no class yields nothing rather than the next method\'s', () => {
	const source = [
		'class Comment extends Model',
		'{',
		'    public function commentable(): MorphTo',
		'    {',
		'        return $this->morphTo();',
		'    }',
		'',
		'    public function author(): BelongsTo',
		'    {',
		'        return $this->belongsTo(User::class);',
		'    }',
		'}',
	].join('\n');

	assert.equal(getRelatedModelFromRelation(source, 'commentable'), undefined);
});

test('an unknown relation name has no declaration and no related model', () => {
	const source = 'class Order extends Model { public function lines(): HasMany { return $this->hasMany(Line::class); } }';

	assert.equal(findRelationMethodRange(source, 'missing'), undefined);
	assert.equal(getRelatedModelFromRelation(source, 'missing'), undefined);
});

// ---- columns ------------------------------------------------------------------------------------

const { findModelPropertyRange, getEloquentColumnAtOffset } = require('../laravelQueryNavigation');

test('resolves a column from a class-headed chain', () => {
	const source = "FacebookBusinessManager::query()->whereNotIn('facebook_business_id', $seen)->get();";

	assert.deepEqual(getEloquentColumnAtOffset(source, at(source, 'facebook_business_id')), {
		headClass: 'FacebookBusinessManager',
		column: 'facebook_business_id',
	});
});

test('resolves a column from $this in a builder', () => {
	const source = [
		'/** @extends Builder<FacebookAdAccount> */',
		'class FacebookAdAccountQueryBuilder extends Builder',
		'{',
		'    public function activeForSync(): self',
		'    {',
		"        return $this->where('status', FBAdAccountStatusEnum::active);",
		'    }',
		'}',
	].join('\n');

	assert.deepEqual(getEloquentColumnAtOffset(source, at(source, "'status'") + 1), {
		headClass: 'FacebookAdAccount',
		column: 'status',
	});
});

test('covers the wider column-naming family', () => {
	for (const method of ['where', 'orWhere', 'whereNotIn', 'whereNull', 'whereDate', 'orderBy', 'pluck', 'sum', 'having']) {
		const source = `Order::query()->${method}('is_active', true);`;

		assert.equal(
			getEloquentColumnAtOffset(source, at(source, 'is_active')).column,
			'is_active',
			`${method} should name a column`,
		);
	}
});

test('every argument of select and groupBy is a column', () => {
	const source = "Order::query()->select('id', 'total')->groupBy('status');";

	assert.equal(getEloquentColumnAtOffset(source, at(source, 'total')).column, 'total');
	assert.equal(getEloquentColumnAtOffset(source, at(source, 'status')).column, 'status');
});

test('the value argument of where is not a column', () => {
	const source = "Order::query()->where('name', 'status');";
	const value = source.lastIndexOf('status') + 2;

	assert.equal(getEloquentColumnAtOffset(source, value), undefined);
});

test('a table-qualified column keeps only the column', () => {
	const source = "Order::query()->where('orders.status', 1);";

	assert.equal(getEloquentColumnAtOffset(source, at(source, 'status')).column, 'status');
});

test('raw SQL and key lookups are not columns', () => {
	const raw = "Order::query()->whereRaw('status = 1');";
	const key = "Order::query()->whereKey('status');";

	assert.equal(getEloquentColumnAtOffset(raw, at(raw, 'status')), undefined);
	assert.equal(getEloquentColumnAtOffset(key, at(key, 'status')), undefined);
});

test('a relation argument is not read as a column', () => {
	const source = "Order::query()->withSum('lines', 'total');";

	assert.equal(getEloquentColumnAtOffset(source, at(source, 'lines')), undefined);
});

test('finds the column on its @property line, not on a same-named relation', () => {
	const source = [
		'/**',
		' * @property bool $is_active',
		' * @property string $facebook_business_id',
		' *',
		' * @property-read ?MetaToken $metaToken',
		' */',
		'class FacebookBusinessManager extends Model',
		'{',
		"    protected $casts = ['is_active' => 'boolean'];",
		'}',
	].join('\n');
	const range = findModelPropertyRange(source, 'facebook_business_id');

	assert.equal(source.slice(range.start, range.end), 'facebook_business_id');
	assert.equal(source.slice(range.start - 1, range.start), '$');
	// @property wins over the $casts entry for a column that appears in both.
	const active = findModelPropertyRange(source, 'is_active');
	assert.ok(source.slice(0, active.start).includes('@property bool'));
});

test('falls back to $casts or $guarded for an undocumented column', () => {
	const source = [
		'class Order extends Model',
		'{',
		"    protected $guarded = ['id', 'created_at'];",
		"    protected $casts = ['shipped_at' => 'datetime'];",
		'}',
	].join('\n');

	assert.equal(source.slice(...Object.values(findModelPropertyRange(source, 'shipped_at'))), 'shipped_at');
	assert.equal(source.slice(...Object.values(findModelPropertyRange(source, 'created_at'))), 'created_at');
});

test('a column the model never mentions yields nothing', () => {
	const source = "class Order extends Model { protected $casts = ['shipped_at' => 'datetime']; }";

	assert.equal(findModelPropertyRange(source, 'nope'), undefined);
});

test('array keys in a column => value map are columns, their values are not', () => {
	const source = "FacebookBusinessManager::query()->updateOrCreate(['facebook_business_id' => $id], ['name' => 'Acme']);";

	assert.equal(getEloquentColumnAtOffset(source, at(source, 'facebook_business_id')).column, 'facebook_business_id');
	assert.equal(getEloquentColumnAtOffset(source, at(source, "'name'") + 1).column, 'name');
	assert.equal(getEloquentColumnAtOffset(source, source.indexOf('Acme') + 2), undefined);
});

test('values listed in whereIn are not columns', () => {
	const source = "Order::query()->whereIn('status', ['active', 'paused']);";

	assert.equal(getEloquentColumnAtOffset(source, at(source, "'status'") + 1).column, 'status');
	assert.equal(getEloquentColumnAtOffset(source, at(source, 'active')), undefined);
	assert.equal(getEloquentColumnAtOffset(source, at(source, 'paused')), undefined);
});

test('select still accepts an array of columns', () => {
	const source = "Order::query()->select(['id', 'total']);";

	assert.equal(getEloquentColumnAtOffset(source, at(source, 'total')).column, 'total');
});

test('a constrained eager load names a relation in the array key', () => {
	const source = "Order::query()->with(['lines' => fn ($q) => $q->select('id')]);";

	assert.equal(getEloquentRelationAtOffset(source, at(source, 'lines')).segments[0], 'lines');
});
