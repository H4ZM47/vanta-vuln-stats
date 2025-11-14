const { VulnerabilityDatabase } = require('../src/core/database');

const runBuildFilters = (filters, options) =>
  VulnerabilityDatabase.prototype.buildFilters.call({}, filters, options);

describe('VulnerabilityDatabase.buildFilters', () => {
  it('qualifies vulnerability columns when alias is provided', () => {
    const { where } = runBuildFilters(
      { search: 'foo', cve: 'CVE-1234' },
      { alias: 'v' }
    );

    expect(where).toContain('v.name');
    expect(where).toContain('v.description');
    expect(where).toContain('v.id');
    expect(where).toContain('v.related_vulns');
  });

  it('falls back to the vulnerabilities table name when alias is omitted', () => {
    const { where } = runBuildFilters({ search: 'bar' });

    expect(where).toContain('vulnerabilities.name');
    expect(where).toContain('vulnerabilities.description');
    expect(where).toContain('vulnerabilities.id');
  });
});
