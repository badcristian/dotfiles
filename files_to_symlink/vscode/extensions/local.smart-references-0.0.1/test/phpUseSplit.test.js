const test = require('node:test');
const assert = require('node:assert/strict');

const { getPhpUseSplit } = require('../phpUseSplit');

test('splits a closure use list, keeping the return type and brace on the closing line', () => {
	const line = '        DB::transaction(function () use ($ad, $adSet, $creative, $trackingId, $adSpec): void {';

	assert.equal(getPhpUseSplit(line), [
		'        DB::transaction(function () use (',
		'            $ad,',
		'            $adSet,',
		'            $creative,',
		'            $trackingId,',
		'            $adSpec',
		'        ): void {',
	].join('\n'));
});

test('parameters of its own are left where they are', () => {
	const line = '    $f = function (int $page, string $cursor) use ($client, $logger) {';

	assert.equal(getPhpUseSplit(line), [
		'    $f = function (int $page, string $cursor) use (',
		'        $client,',
		'        $logger',
		'    ) {',
	].join('\n'));
});

test('a by-reference variable keeps its ampersand', () => {
	const line = 'DB::transaction(function () use ($steps, &$results, &$currentStep): void {';

	assert.equal(getPhpUseSplit(line), [
		'DB::transaction(function () use (',
		'    $steps,',
		'    &$results,',
		'    &$currentStep',
		'): void {',
	].join('\n'));
});

test('a static closure and a by-reference closure are both use lists', () => {
	assert.ok(getPhpUseSplit('$f = static function () use ($a, $b) {'));
	assert.ok(getPhpUseSplit('$f = function &() use ($a, $b) {'));
});

test('a PHP 8.0 trailing comma does not become a blank line', () => {
	const line = '$f = function () use ($a, $b,) {';

	assert.equal(getPhpUseSplit(line), [
		'$f = function () use (',
		'    $a,',
		'    $b',
		') {',
	].join('\n'));
});

test('a single use variable is left alone', () => {
	assert.equal(getPhpUseSplit('DB::transaction(function () use ($ad): void {'), undefined);
});

test('an already split use list is left alone', () => {
	assert.equal(getPhpUseSplit('        DB::transaction(function () use ('), undefined);
});

test('an import and a trait use are not closure use lists', () => {
	assert.equal(getPhpUseSplit('use Illuminate\\Support\\Facades\\DB;'), undefined);
	assert.equal(getPhpUseSplit('    use Dispatchable, InteractsWithQueue, Queueable;'), undefined);
});

test('a closure with no use list is left alone', () => {
	assert.equal(getPhpUseSplit('DB::transaction(function (Ad $ad, AdSet $adSet): void {'), undefined);
});

test('a commented-out closure is not rewritten', () => {
	assert.equal(getPhpUseSplit('        // DB::transaction(function () use ($ad, $adSet): void {'), undefined);
	assert.equal(getPhpUseSplit('     * DB::transaction(function () use ($ad, $adSet): void {'), undefined);
});
