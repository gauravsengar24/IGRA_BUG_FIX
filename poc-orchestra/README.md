# Docker Orchestration POC

This is a proof of concept project that serves as a reference implementation for secure microservices deployment on a single docker host with `docker compose`.  
It demonstrates advanced Docker orchestration patterns with a focus on security, network isolation, and hierarchical configuration management.

## Features

### Hierarchical Docker Compose Organization
- Modular service definitions using `extends` functionality
- Individual service components defined in their own directories (`app1/`, `app2/`)
- Root-level orchestration combining all services
- Consistent naming conventions across service hierarchies

### Network Security & Isolation
- Segregated network spaces:
    - `ext_net`: Docker network for publicly accessible services
    - `int_net`: Docker network for service-to-service communication
- Service isolation with controlled network exposure:
    - No services, except `proxy`, exposed on the host's external network interfaces 
- Proxy-based access control for external requests

### Nginx Proxy Configuration
- URL-based routing (`/app1/`, `/app2/`)
- Port-based service access (ports 9091, 9092)
- Token-based authentication
- URL rewriting and path normalization
- Upstream server definitions for proper routing and balancing

## Project Structure
```
poc-orchestra/
├── app1/ 
│   ├── docker-compose.yml 
│   └── ... 
├── app2/ 
│   ├── docker-compose.yml 
│   └── ...
├── proxy/ 
│   ├── docker-compose.yml 
│   └── nginx.conf
└── docker-compose.yml
```

## Security Features

### Access Control
- Token-based authentication for all external requests
- Predefined access tokens in nginx configuration
- 403 Forbidden response for invalid tokens
- URL rewriting to hide internal paths

### Network Isolation
- Services are only exposed through the proxy when required
- The proxy only is exposed on the host's external interface(s)
- Internal services are completely isolated from external access
- Controlled service-to-service communication

## Getting Started

1. Create the required Docker networks:
```bash
docker network create ext_net
docker network create int_net
```

2. Start the services:
```bash
docker-compose up -d
```

## Access Patterns

### URL-based Access
- Access App1: `http://localhost/[token]/app1/`
- Access  `intSrv` service on App1 via its `extSrv`: `http://localhost/[token]/app1/int/`
- Access App2 (`extSrv` service): `http://localhost/[token]/app2/`
- Access  `intSrv` service on App2 via its `extSrv`: `http://localhost/[token]/app1/int/`

Tokens are listed in the [proxy's config](./proxy/nginx.conf).

### Port-based Access
- App1: `http://localhost:9091`, `http://localhost:9091/int/` 
- App2: `http://localhost:9092`, `http://localhost:9092/int/`

## Service Dependencies

- Proxy depends on external-facing services (`app1_extSrv`, `app2_extSrv`)
- Internal services (`app1_intSrv`, `app2_intSrv`) are only accessible within the internal network
- Service aliases enable internal DNS resolution

## Notes

- All services use nginx for demonstration purposes
- Token validation is implemented at the proxy level
- Network isolation is enforced through Docker network definitions
- Service names are prefixed to avoid conflicts in the composed environment

## Best Practices Demonstrated

1. Clear separation of concerns in configuration files
2. Secure network isolation
3. Centralized access control
4. Hierarchical configuration management
5. Consistent naming conventions
6. Controlled service exposure
