-- Plain Postgres behind an API server: the database is not reachable from the browser.
create table users (id serial primary key, email text not null);
