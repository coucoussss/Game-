// Substitue IPv6 par IPv4 pour les programmes lancés dans un noyau sans IPv6.
// Une socket AF_INET6 est créée en AF_INET ; les adresses sont converties à la volée.
#define _GNU_SOURCE
#include <dlfcn.h>
#include <errno.h>
#include <netinet/in.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <arpa/inet.h>

#define MAXFD 65536
static unsigned char emu[MAXFD];

static int (*r_socket)(int, int, int);
static int (*r_bind)(int, const struct sockaddr *, socklen_t);
static int (*r_connect)(int, const struct sockaddr *, socklen_t);
static int (*r_getsockname)(int, struct sockaddr *, socklen_t *);
static int (*r_getpeername)(int, struct sockaddr *, socklen_t *);
static int (*r_accept)(int, struct sockaddr *, socklen_t *);
static int (*r_accept4)(int, struct sockaddr *, socklen_t *, int);
static int (*r_setsockopt)(int, int, int, const void *, socklen_t);
static int (*r_getsockopt)(int, int, int, void *, socklen_t *);
static int (*r_close)(int);

static void init(void) {
  if (r_socket) return;
  r_socket = dlsym(RTLD_NEXT, "socket");
  r_bind = dlsym(RTLD_NEXT, "bind");
  r_connect = dlsym(RTLD_NEXT, "connect");
  r_getsockname = dlsym(RTLD_NEXT, "getsockname");
  r_getpeername = dlsym(RTLD_NEXT, "getpeername");
  r_accept = dlsym(RTLD_NEXT, "accept");
  r_accept4 = dlsym(RTLD_NEXT, "accept4");
  r_setsockopt = dlsym(RTLD_NEXT, "setsockopt");
  r_getsockopt = dlsym(RTLD_NEXT, "getsockopt");
  r_close = dlsym(RTLD_NEXT, "close");
}
static int isemu(int fd) { return fd >= 0 && fd < MAXFD && emu[fd]; }

static void to4(const struct sockaddr_in6 *a6, struct sockaddr_in *a4) {
  memset(a4, 0, sizeof *a4);
  a4->sin_family = AF_INET;
  a4->sin_port = a6->sin6_port;
  if (IN6_IS_ADDR_UNSPECIFIED(&a6->sin6_addr)) a4->sin_addr.s_addr = htonl(INADDR_ANY);
  else if (IN6_IS_ADDR_LOOPBACK(&a6->sin6_addr)) a4->sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  else if (IN6_IS_ADDR_V4MAPPED(&a6->sin6_addr)) memcpy(&a4->sin_addr, &a6->sin6_addr.s6_addr[12], 4);
  else a4->sin_addr.s_addr = htonl(INADDR_ANY);
}
static void to6(const struct sockaddr_in *a4, struct sockaddr_in6 *a6) {
  memset(a6, 0, sizeof *a6);
  a6->sin6_family = AF_INET6;
  a6->sin6_port = a4->sin_port;
  a6->sin6_addr.s6_addr[10] = 0xff; a6->sin6_addr.s6_addr[11] = 0xff;
  memcpy(&a6->sin6_addr.s6_addr[12], &a4->sin_addr, 4);
}

int socket(int domain, int type, int protocol) {
  init();
  if (domain == AF_INET6) {
    int fd = r_socket(AF_INET, type, 0);
    if (fd >= 0 && fd < MAXFD) emu[fd] = 1;
    return fd;
  }
  return r_socket(domain, type, protocol);
}
int bind(int fd, const struct sockaddr *a, socklen_t l) {
  init();
  if (isemu(fd) && a && a->sa_family == AF_INET6) {
    struct sockaddr_in a4; to4((const struct sockaddr_in6 *)a, &a4);
    int rc = r_bind(fd, (struct sockaddr *)&a4, sizeof a4);
    if (rc < 0 && errno == EADDRINUSE) { a4.sin_port = 0; a4.sin_addr.s_addr = htonl(INADDR_LOOPBACK); rc = r_bind(fd, (struct sockaddr *)&a4, sizeof a4); }
    return rc;
  }
  return r_bind(fd, a, l);
}
int connect(int fd, const struct sockaddr *a, socklen_t l) {
  init();
  if (isemu(fd) && a && a->sa_family == AF_INET6) { struct sockaddr_in a4; to4((const struct sockaddr_in6 *)a, &a4); return r_connect(fd, (struct sockaddr *)&a4, sizeof a4); }
  return r_connect(fd, a, l);
}
static int conv_out(int rc, struct sockaddr *a, socklen_t *l, int fd) {
  if (rc == 0 && isemu(fd) && a && l && *l >= sizeof(struct sockaddr_in6) && a->sa_family == AF_INET) {
    struct sockaddr_in a4; memcpy(&a4, a, sizeof a4); struct sockaddr_in6 a6; to6(&a4, &a6); memcpy(a, &a6, sizeof a6); *l = sizeof a6;
  }
  return rc;
}
int getsockname(int fd, struct sockaddr *a, socklen_t *l) { init(); return conv_out(r_getsockname(fd, a, l), a, l, fd); }
int getpeername(int fd, struct sockaddr *a, socklen_t *l) { init(); return conv_out(r_getpeername(fd, a, l), a, l, fd); }
int accept(int fd, struct sockaddr *a, socklen_t *l) {
  init(); int src = isemu(fd);
  int n = r_accept(fd, a, l);
  if (n >= 0 && n < MAXFD) emu[n] = src;
  if (n >= 0 && src) conv_out(0, a, l, n);
  return n;
}
int accept4(int fd, struct sockaddr *a, socklen_t *l, int fl) {
  init(); int src = isemu(fd);
  int n = r_accept4(fd, a, l, fl);
  if (n >= 0 && n < MAXFD) emu[n] = src;
  if (n >= 0 && src) conv_out(0, a, l, n);
  return n;
}
int setsockopt(int fd, int level, int name, const void *v, socklen_t l) {
  init();
  if (level == IPPROTO_IPV6) return 0;
  return r_setsockopt(fd, level, name, v, l);
}
int getsockopt(int fd, int level, int name, void *v, socklen_t *l) {
  init();
  if (level == IPPROTO_IPV6) { if (v && l && *l >= sizeof(int)) { *(int *)v = 0; *l = sizeof(int); } return 0; }
  return r_getsockopt(fd, level, name, v, l);
}
int close(int fd) { init(); if (fd >= 0 && fd < MAXFD) emu[fd] = 0; return r_close(fd); }
