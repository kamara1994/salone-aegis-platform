from ipaddress import ip_interface, ip_network
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator


class Model(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Site(Model):
    name: str = Field(min_length=1, max_length=100)


class Rack(Site):
    site_id: UUID


class DeviceModel(Site):
    role: Literal['host', 'switch', 'router', 'firewall', 'console_server']
    platform: Literal['linux', 'windows', 'ios', 'opnsense', 'generic'] = 'generic'
    protocols: list[Literal['ssh', 'rdp', 'vnc', 'serial', 'novnc', 'guacamole']] = []


class Rule(Model):
    protocol: Literal['any', 'icmp', 'tcp', 'udp'] = 'any'
    port: int | None = Field(default=None, ge=1, le=65535)
    source: str = '0.0.0.0/0'
    destination: str = '0.0.0.0/0'
    action: Literal['allow', 'deny']

    @field_validator('source', 'destination')
    @classmethod
    def network(cls, value):
        return str(ip_network(value))


class Device(Site):
    model_id: UUID
    rack_id: UUID | None = None
    power: Literal['on', 'off'] = 'on'
    health: Literal['healthy', 'degraded', 'failed'] = 'healthy'
    boot_count: int = Field(default=0, ge=0)
    rules: list[Rule] = Field(default_factory=list, max_length=100)
    nat_ip: str | None = None
    dns: dict[str, str] = Field(default_factory=dict, max_length=100)


class VM(Device):
    hypervisor_id: UUID


class Interface(Site):
    device_id: UUID
    port_type: Literal['ethernet', 'fiber', 'serial', 'console'] = 'ethernet'
    speed: int = Field(default=1000, gt=0, le=400000)
    duplex: Literal['full', 'half'] = 'full'
    mode: Literal['access', 'trunk', 'routed'] = 'access'
    vlans: list[int] = Field(default_factory=lambda: [1], min_length=1, max_length=4094)
    native_vlan: int = Field(default=1, ge=1, le=4094)
    enabled: bool = True
    address: str | None = None
    dhcp: bool = False

    @field_validator('vlans')
    @classmethod
    def vlan_ids(cls, value):
        if len(set(value)) != len(value) or any(v < 1 or v > 4094 for v in value):
            raise ValueError('VLANs must be unique identifiers in 1..4094')
        return value

    @field_validator('address')
    @classmethod
    def ip(cls, value):
        return str(ip_interface(value)) if value else None


class CableType(Site):
    medium: Literal['copper', 'fiber', 'serial', 'console']
    wiring: Literal['straight', 'crossover', 'rollover', 'serial', 'fiber']


class Cable(Model):
    a: UUID
    b: UUID
    type_id: UUID
    fault: Literal['none', 'unplugged', 'damaged'] = 'none'
    latency_ms: float = Field(default=1, ge=0, le=60000)
    loss_percent: float = Field(default=0, ge=0, le=100)


class VLAN(Site):
    tag: int = Field(ge=1, le=4094)


class Subnet(Site):
    cidr: str
    vlan_id: UUID
    dhcp_start: str | None = None
    dhcp_end: str | None = None
    gateway: str | None = None

    @field_validator('cidr')
    @classmethod
    def cidr_value(cls, value):
        return str(ip_network(value))


class Route(Model):
    device_id: UUID
    interface_id: UUID
    network: str
    next_hop: str | None = None
    metric: int = Field(default=0, ge=0, le=65535)

    @field_validator('network')
    @classmethod
    def network_value(cls, value):
        return str(ip_network(value))


class Position(Model):
    device_id: UUID
    x: float = Field(ge=-100000, le=100000)
    y: float = Field(ge=-100000, le=100000)


class Layout(Site):
    positions: list[Position] = Field(default_factory=list, max_length=1000)


class Packet(Model):
    source_id: UUID
    destination: str = Field(min_length=1, max_length=253)
    protocol: Literal['icmp', 'tcp', 'udp'] = 'icmp'
    port: int | None = Field(default=None, ge=1, le=65535)
    sequence: int = Field(default=0, ge=0)
    ttl: int = Field(default=32, ge=1, le=64)


SCHEMAS = {'sites': Site, 'racks': Rack, 'device-models': DeviceModel, 'devices': Device,
           'interfaces': Interface, 'cable-types': CableType, 'cables': Cable,
           'vlans': VLAN, 'subnets': Subnet, 'routes': Route, 'vms': VM, 'layouts': Layout}
