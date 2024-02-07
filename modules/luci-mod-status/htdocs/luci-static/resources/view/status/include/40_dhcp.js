'use strict';
'require baseclass';
'require rpc';
'require uci';
'require network';
'require validation';

var callLuciDHCPLeases = rpc.declare({
	object: 'luci-rpc',
	method: 'getDHCPLeases',
	expect: { '': {} }
});

return baseclass.extend({
	title: 'Active DHCP Leases',

	isMACStatic: {},

	load: function() {
		return Promise.all([
			callLuciDHCPLeases(),
			network.getHostHints(),
			L.resolveDefault(uci.load('dhcp'))
		]);
	},

	handleCreateStaticLease: function(lease, ev) {
		ev.currentTarget.classList.add('spinning');
		ev.currentTarget.disabled = true;
		ev.currentTarget.blur();

		var cfg = uci.add('dhcp', 'host');
		uci.set('dhcp', cfg, 'name', lease.hostname);
		uci.set('dhcp', cfg, 'ip', lease.ipaddr);
		uci.set('dhcp', cfg, 'mac', lease.macaddr.toUpperCase());

		return uci.save()
			.then(L.bind(L.ui.changes.init, L.ui.changes))
			.then(L.bind(L.ui.changes.displayChanges, L.ui.changes));
	},

	renderLeases: function(data) {
		var leases = Array.isArray(data[0].dhcp_leases) ? data[0].dhcp_leases : [],
		    hosts = uci.sections('dhcp', 'host'),
		    isReadonlyView = !L.hasViewPermission();

		for (var i = 0; i < hosts.length; i++) {
			var host = hosts[i];

			if (host.mac) {
				var macs = L.toArray(host.mac);
				for (var j = 0; j < macs.length; j++) {
					var mac = macs[j].toUpperCase();
					this.isMACStatic[mac] = true;
				}
			}
		};

		var table = E('table', { 'id': 'status_leases', 'class': 'table lases' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th' }, _('Hostname')),
				E('th', { 'class': 'th' }, _('IPv4 address')),
				E('th', { 'class': 'th' }, _('MAC address')),
				E('th', { 'class': 'th' }, _('Lease time remaining')),
				isReadonlyView ? E([]) : E('th', { 'class': 'th cbi-section-actions' }, _('Static Lease'))
			])
		]);

		cbi_update_table(table, leases.map(L.bind(function(lease) {
			var exp, rows;

			if (lease.expires === false)
				exp = E('em', _('unlimited'));
			else if (lease.expires <= 0)
				exp = E('em', _('expired'));
			else
				exp = '%t'.format(lease.expires);

			var hint = lease.macaddr ? machints.filter(function(h) { return h[0] == lease.macaddr })[0] : null,
			    host = null;

			if (hint && lease.hostname && lease.hostname != hint[1])
				host = '%s (%s)'.format(lease.hostname, hint[1]);
			else if (lease.hostname)
				host = lease.hostname;

			rows = [
				host || '-',
				lease.ipaddr,
				lease.macaddr,
				exp
			];

			if (!isReadonlyView && lease.macaddr != null) {
				var mac = lease.macaddr.toUpperCase();
				rows.push(E('button', {
					'class': 'cbi-button cbi-button-apply',
					'click': L.bind(this.handleCreateStaticLease, this, lease),
					'disabled': this.isMACStatic[mac]
				}, [ _('Set Static') ]));
			}

			return rows;
		}, this)), E('em', _('There are no active leases')));

		return E(table);
	},

	render: function(data) {
		if (L.hasSystemFeature('dnsmasq') || L.hasSystemFeature('odhcpd'))
			return this.renderLeases(data);

		return E([]);
	}
});
